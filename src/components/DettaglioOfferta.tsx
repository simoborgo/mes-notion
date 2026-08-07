"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Offerta, OffertaRiga, StimaRepartoRiga } from "@/lib/offerteRepository";
import type { Articolo } from "@/lib/articoliRepository";
import { REPARTI_PRODUZIONE } from "@/lib/types";
import CodiceArticoloAutocomplete from "./CodiceArticoloAutocomplete";

const inputCls = "rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

const STATO_BADGE: Record<string, { bg: string; color: string }> = {
  Offerta: { bg: "#FEF3C7", color: "#92400E" },
  Confermata: { bg: "#DCFCE7", color: "#166534" },
  Persa: { bg: "#F3F4F6", color: "#6B7280" },
};

function fmtData(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("it-IT");
}

interface CommessaOpzione {
  id: string;
  numeroCommessa: string;
  cliente: string;
}

export default function DettaglioOfferta({
  offerta: offertaIniziale, righeIniziali, articoli, commesse, costoOrarioManodopera, stimaRepartoIniziale,
}: {
  offerta: Offerta;
  righeIniziali: OffertaRiga[];
  articoli: Articolo[];
  commesse: CommessaOpzione[];
  costoOrarioManodopera: number;
  stimaRepartoIniziale: StimaRepartoRiga[];
}) {
  const router = useRouter();
  const [offerta, setOfferta] = useState(offertaIniziale);
  const [righe, setRighe] = useState(righeIniziali);

  const [stimaReparto, setStimaReparto] = useState<Record<string, string>>(() => {
    const base = Object.fromEntries(REPARTI_PRODUZIONE.map(r => [r, ""]));
    for (const r of stimaRepartoIniziale) base[r.reparto] = String(r.percentuale);
    return base;
  });
  const [salvandoStima, setSalvandoStima] = useState(false);
  const [erroreStima, setErroreStima] = useState("");
  const [salvatoStima, setSalvatoStima] = useState(false);

  const [codiceArticolo, setCodiceArticolo] = useState<string | null>(null);
  const [quantita, setQuantita] = useState("1");
  const [orePreventivate, setOrePreventivate] = useState("");
  const [aggiungendo, setAggiungendo] = useState(false);
  const [erroreRiga, setErroreRiga] = useState("");

  const [modalConferma, setModalConferma] = useState(false);
  const [searchCommessa, setSearchCommessa] = useState("");
  const [commessaScelta, setCommessaScelta] = useState<CommessaOpzione | null>(null);
  const [confermando, setConfermando] = useState(false);
  const [errorePersa, setErrorePersa] = useState("");
  const [erroreConferma, setErroreConferma] = useState("");
  const [salvandoStato, setSalvandoStato] = useState(false);

  const [modificaAperta, setModificaAperta] = useState(false);
  const [editCliente, setEditCliente] = useState("");
  const [editValoreCommessa, setEditValoreCommessa] = useState("");
  const [editDataOfferta, setEditDataOfferta] = useState("");
  const [editDataConsegnaPrevista, setEditDataConsegnaPrevista] = useState("");
  const [editProbabilita, setEditProbabilita] = useState("");
  const [salvandoModifica, setSalvandoModifica] = useState(false);
  const [erroreModifica, setErroreModifica] = useState("");

  const [eliminando, setEliminando] = useState(false);
  const [erroreElimina, setErroreElimina] = useState("");

  const [risincronizzando, setRisincronizzando] = useState(false);
  const [erroreRisincronizza, setErroreRisincronizza] = useState("");
  const [esitoRisincronizza, setEsitoRisincronizza] = useState<string | null>(null);

  async function risincronizzaData() {
    setRisincronizzando(true);
    setErroreRisincronizza("");
    setEsitoRisincronizza(null);
    try {
      const res = await fetch(`/api/offerte/${offerta.id}/risincronizza-data`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setOfferta(data.offerta);
      setEsitoRisincronizza(data.cambiata
        ? `Aggiornata: ${fmtData(data.dataPrecedente)} → ${fmtData(data.offerta.dataConsegnaPrevista)}`
        : "Già allineata alla Commessa — nessuna modifica");
    } catch (e) {
      setErroreRisincronizza(e instanceof Error ? e.message : "Errore risincronizzazione");
    } finally {
      setRisincronizzando(false);
    }
  }

  function apriModifica() {
    setEditCliente(offerta.cliente);
    setEditValoreCommessa(offerta.valoreCommessa != null ? String(offerta.valoreCommessa) : "");
    setEditDataOfferta(offerta.dataOfferta);
    setEditDataConsegnaPrevista(offerta.dataConsegnaPrevista ?? "");
    setEditProbabilita(String(offerta.probabilitaChiusura));
    setErroreModifica("");
    setModificaAperta(true);
  }

  async function salvaModifica() {
    if (!editCliente.trim()) { setErroreModifica("Il cliente è obbligatorio"); return; }
    setSalvandoModifica(true);
    setErroreModifica("");
    try {
      const res = await fetch(`/api/offerte/${offerta.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente: editCliente.trim(),
          valoreCommessa: editValoreCommessa || null,
          dataOfferta: editDataOfferta,
          dataConsegnaPrevista: editDataConsegnaPrevista || null,
          probabilitaChiusura: Number(editProbabilita),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setOfferta(data);
      setModificaAperta(false);
    } catch (e) {
      setErroreModifica(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSalvandoModifica(false);
    }
  }

  async function eliminaOfferta() {
    if (!confirm(`Eliminare definitivamente l'offerta di "${offerta.cliente}"? Cancella anche tutte le righe — non è recuperabile.`)) return;
    setEliminando(true);
    setErroreElimina("");
    try {
      const res = await fetch(`/api/offerte/${offerta.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      router.push("/offerte");
      router.refresh();
    } catch (e) {
      setErroreElimina(e instanceof Error ? e.message : "Errore eliminazione");
      setEliminando(false);
    }
  }

  const totaleOre = useMemo(() => righe.reduce((s, r) => s + r.orePreventivate, 0), [righe]);

  const commesseFiltrate = useMemo(() => {
    const q = searchCommessa.toLowerCase().trim();
    if (!q) return commesse.slice(0, 20);
    return commesse.filter(c => `${c.numeroCommessa} ${c.cliente}`.toLowerCase().includes(q)).slice(0, 20);
  }, [commesse, searchCommessa]);

  async function aggiungiRiga() {
    const q = Number(quantita);
    const h = Number(orePreventivate);
    if (!codiceArticolo) { setErroreRiga("Seleziona un articolo"); return; }
    if (!(q > 0)) { setErroreRiga("Quantità non valida"); return; }
    if (!(h > 0)) { setErroreRiga("Ore preventivate non valide"); return; }
    setAggiungendo(true);
    setErroreRiga("");
    try {
      const res = await fetch(`/api/offerte/${offerta.id}/righe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codiceArticolo, quantita: q, orePreventivate: h }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setRighe(prev => [...prev, data]);
      setCodiceArticolo(null);
      setQuantita("1");
      setOrePreventivate("");
    } catch (e) {
      setErroreRiga(e instanceof Error ? e.message : "Errore aggiunta riga");
    } finally {
      setAggiungendo(false);
    }
  }

  const sommaStima = REPARTI_PRODUZIONE.reduce((s, r) => s + (Number(stimaReparto[r]) || 0), 0);
  const oreTotaliStimate = offerta.valoreCommessa != null && costoOrarioManodopera > 0
    ? offerta.valoreCommessa / costoOrarioManodopera
    : null;

  async function salvaStima() {
    setSalvandoStima(true);
    setErroreStima("");
    setSalvatoStima(false);
    try {
      const righeStima = REPARTI_PRODUZIONE
        .map(reparto => ({ reparto, percentuale: Number(stimaReparto[reparto]) || 0 }))
        .filter(r => r.percentuale > 0);
      const res = await fetch(`/api/offerte/${offerta.id}/stima-reparto`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ righe: righeStima }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setSalvatoStima(true);
    } catch (e) {
      setErroreStima(e instanceof Error ? e.message : "Errore salvataggio stima");
    } finally {
      setSalvandoStima(false);
    }
  }

  async function confermaOfferta() {
    if (!commessaScelta) { setErroreConferma("Seleziona una Commessa"); return; }
    setConfermando(true);
    setErroreConferma("");
    try {
      const res = await fetch(`/api/offerte/${offerta.id}/conferma`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commessaId: commessaScelta.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setOfferta(data);
      setModalConferma(false);
      router.refresh();
    } catch (e) {
      setErroreConferma(e instanceof Error ? e.message : "Errore conferma");
    } finally {
      setConfermando(false);
    }
  }

  async function segnaPersa() {
    if (!confirm("Segnare questa offerta come persa? Non sarà più possibile aggiungere righe.")) return;
    setSalvandoStato(true);
    setErrorePersa("");
    try {
      const res = await fetch(`/api/offerte/${offerta.id}/persa`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setOfferta(data);
    } catch (e) {
      setErrorePersa(e instanceof Error ? e.message : "Errore");
    } finally {
      setSalvandoStato(false);
    }
  }

  const badge = STATO_BADGE[offerta.stato];
  const puoModificareRighe = offerta.stato === "Offerta";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 p-4 space-y-2" style={{ borderColor: "#e5e4e0", background: "white" }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="font-bold text-lg" style={{ color: "var(--color-black)" }}>{offerta.cliente}</p>
            <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Creata da {offerta.creatoDa}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: badge.bg, color: badge.color }}>
              {offerta.stato}
            </span>
            {!modificaAperta && (
              <button onClick={apriModifica} className="text-xs font-semibold underline" style={{ color: "var(--color-primary)" }}>
                Modifica
              </button>
            )}
          </div>
        </div>

        {modificaAperta ? (
          <div className="space-y-3 pt-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>Cliente</label>
                <input className={inputCls} style={{ height: 44, width: "100%" }} value={editCliente} onChange={e => setEditCliente(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>Valore commessa (€)</label>
                <input type="number" min="0" step="any" className={inputCls} style={{ height: 44, width: "100%" }} value={editValoreCommessa} onChange={e => setEditValoreCommessa(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>Data offerta</label>
                <input type="date" className={inputCls} style={{ height: 44, width: "100%" }} value={editDataOfferta} onChange={e => setEditDataOfferta(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>Data consegna prevista</label>
                <input type="date" className={inputCls} style={{ height: 44, width: "100%" }} value={editDataConsegnaPrevista} onChange={e => setEditDataConsegnaPrevista(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>Probabilità chiusura (%)</label>
                <input type="number" min="0" max="100" className={inputCls} style={{ height: 44, width: "100%" }} value={editProbabilita} onChange={e => setEditProbabilita(e.target.value)} />
              </div>
            </div>
            {offerta.stato === "Confermata" && (
              <p className="text-xs" style={{ color: "#92400E" }}>
                ⚠ Offerta già Confermata: cambiare la data consegna qui non risincronizza automaticamente con la Commessa collegata — usala solo per correggere un errore di battitura.
              </p>
            )}
            {erroreModifica && <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{erroreModifica}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModificaAperta(false)} className="px-4 py-2.5 text-sm font-medium rounded-lg border hover:bg-gray-50">Annulla</button>
              <button
                onClick={salvaModifica}
                disabled={salvandoModifica}
                className="px-4 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
                style={{ background: "var(--color-primary)" }}
              >
                {salvandoModifica ? "Salvo…" : "Salva modifiche"}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-1 text-sm sm:grid-cols-2" style={{ color: "var(--color-black)" }}>
            <p><span style={{ color: "var(--color-grey-mid)" }}>Valore commessa:</span> {offerta.valoreCommessa != null ? `€${offerta.valoreCommessa.toLocaleString("it-IT")}` : "—"}</p>
            <p><span style={{ color: "var(--color-grey-mid)" }}>Probabilità chiusura:</span> {offerta.probabilitaChiusura}%</p>
            <p><span style={{ color: "var(--color-grey-mid)" }}>Data offerta:</span> {fmtData(offerta.dataOfferta)}</p>
            <p><span style={{ color: "var(--color-grey-mid)" }}>Data consegna prevista:</span> {fmtData(offerta.dataConsegnaPrevista)}</p>
            {offerta.commessaId && <p className="sm:col-span-2"><span style={{ color: "var(--color-grey-mid)" }}>Commessa collegata:</span> {offerta.commessaId}</p>}
          </div>
        )}

        {!modificaAperta && offerta.stato === "Confermata" && offerta.commessaId && (
          <div className="pt-1">
            <button
              onClick={risincronizzaData}
              disabled={risincronizzando}
              className="text-xs font-semibold underline disabled:opacity-60"
              style={{ color: "var(--color-primary)" }}
            >
              {risincronizzando ? "Controllo…" : "Risincronizza data con la Commessa"}
            </button>
            {esitoRisincronizza && <p className="text-xs mt-1" style={{ color: "var(--color-grey-mid)" }}>{esitoRisincronizza}</p>}
            {erroreRisincronizza && <p className="text-xs font-medium mt-1" style={{ color: "#991B1B" }}>{erroreRisincronizza}</p>}
          </div>
        )}

        {!modificaAperta && offerta.stato === "Offerta" && (
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setModalConferma(true)}
              className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white"
              style={{ background: "#166534" }}
            >
              Conferma offerta
            </button>
            <button
              onClick={segnaPersa}
              disabled={salvandoStato}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold border disabled:opacity-60"
              style={{ borderColor: "#d1d5db", color: "var(--color-grey-mid)" }}
            >
              Segna persa
            </button>
          </div>
        )}
        {errorePersa && <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{errorePersa}</p>}

        {!modificaAperta && (
          <div className="pt-2 border-t flex items-center justify-between" style={{ borderColor: "#f0ece5" }}>
            <button
              onClick={eliminaOfferta}
              disabled={eliminando}
              className="text-xs font-medium underline disabled:opacity-60"
              style={{ color: "#991B1B" }}
            >
              {eliminando ? "Elimino…" : "Elimina offerta"}
            </button>
            {erroreElimina && <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{erroreElimina}</p>}
          </div>
        )}
      </div>

      <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "#e5e4e0", background: "white" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ color: "var(--color-black)" }}>Righe (per articolo)</h3>
          <span className="text-xs font-semibold" style={{ color: "var(--color-grey-mid)" }}>{righe.length} righe · {totaleOre}h totali preventivate</span>
        </div>
        {righe.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: "var(--color-grey-mid)" }}>Nessuna riga ancora</p>
        ) : (
          <div className="space-y-2">
            {righe.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "#F5F2EE" }}>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-sm">{r.codiceArticolo}</span>
                  <span className="text-xs ml-2" style={{ color: "var(--color-grey-mid)" }}>{r.articoloDescrizione}</span>
                </div>
                <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>×{r.quantita}</span>
                <span className="text-sm font-semibold tabular-nums">{r.orePreventivate}h</span>
              </div>
            ))}
          </div>
        )}

        {puoModificareRighe && (
          <div className="pt-2 border-t space-y-2" style={{ borderColor: "#e5e4e0" }}>
            <CodiceArticoloAutocomplete articoli={articoli} value={codiceArticolo} onChange={setCodiceArticolo} placeholder="Cerca articolo…" />
            <div className="flex gap-2 items-end flex-wrap">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>Quantità</label>
                <input type="number" min="0" step="any" className={inputCls} style={{ width: 90, height: 44 }} value={quantita} onChange={e => setQuantita(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>Ore preventivate</label>
                <input type="number" min="0" step="any" className={inputCls} style={{ width: 110, height: 44 }} value={orePreventivate} onChange={e => setOrePreventivate(e.target.value)} />
              </div>
              <button
                onClick={aggiungiRiga}
                disabled={aggiungendo}
                className="px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                style={{ height: 44, background: "var(--color-primary)" }}
              >
                {aggiungendo ? "…" : "+ Aggiungi"}
              </button>
            </div>
            {erroreRiga && <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{erroreRiga}</p>}
          </div>
        )}
      </div>

      {righe.length === 0 && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "#e5e4e0", background: "white" }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-black)" }}>Stima ore per reparto</h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
              Fallback per quando non si inseriscono le righe articolo: ore totali = valore commessa / costo orario manodopera,
              ripartite manualmente tra reparti. Resta modificabile anche a offerta Confermata.
            </p>
          </div>

          {oreTotaliStimate == null ? (
            <p className="text-xs font-medium" style={{ color: "#92400E" }}>
              {offerta.valoreCommessa == null ? "Manca il valore commessa sull'offerta." : "Costo orario manodopera non configurato (Amministrazione → Parametri Reparto)."}
            </p>
          ) : (
            <p className="text-sm font-semibold">Ore totali stimate: {oreTotaliStimate.toFixed(1)}h</p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {REPARTI_PRODUZIONE.map(reparto => (
              <div key={reparto}>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>{reparto}</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number" min="0" max="100" step="any" className={inputCls} style={{ width: 70, height: 38 }}
                    value={stimaReparto[reparto]}
                    onChange={e => { setStimaReparto(prev => ({ ...prev, [reparto]: e.target.value })); setSalvatoStima(false); }}
                  />
                  <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>%</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold" style={{ color: sommaStima >= 95 && sommaStima <= 105 ? "#166534" : "#991B1B" }}>
              Totale: {sommaStima.toFixed(1)}%
            </span>
            <button
              onClick={salvaStima}
              disabled={salvandoStima}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--color-primary)" }}
            >
              {salvandoStima ? "Salvo…" : "Salva stima"}
            </button>
            {salvatoStima && <span className="text-xs font-medium" style={{ color: "#166534" }}>Salvata</span>}
          </div>
          {erroreStima && <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{erroreStima}</p>}
        </div>
      )}

      {modalConferma && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setModalConferma(false)}>
          <div className="w-full max-w-md rounded-xl p-5 space-y-4" style={{ background: "white" }} onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold" style={{ color: "var(--color-black)" }}>Conferma offerta</h3>
            <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
              Seleziona la Commessa già esistente collegata a questa offerta — probabilità forzata al 100% e data consegna aggiornata dal dato reale.
            </p>
            {commessaScelta ? (
              <div className="flex items-center gap-2 px-3 rounded-lg border text-sm font-medium" style={{ height: 48, borderColor: "var(--color-primary)", background: "rgba(240,143,37,0.06)" }}>
                <span className="flex-1 min-w-0 truncate">{commessaScelta.numeroCommessa} — {commessaScelta.cliente}</span>
                <button onClick={() => setCommessaScelta(null)} className="text-gray-400 hover:text-gray-600 text-base leading-none">×</button>
              </div>
            ) : (
              <div className="space-y-1">
                <input
                  type="text" className={inputCls} style={{ width: "100%", height: 44 }}
                  placeholder="Cerca commessa…" value={searchCommessa}
                  onChange={e => setSearchCommessa(e.target.value)}
                />
                <div className="rounded-lg border overflow-y-auto" style={{ borderColor: "#d1d5db", maxHeight: 220 }}>
                  {commesseFiltrate.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setCommessaScelta(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 border-b last:border-0"
                      style={{ borderColor: "#f0ece5" }}
                    >
                      <span className="font-semibold">{c.numeroCommessa}</span>
                      <span className="ml-2" style={{ color: "var(--color-grey-mid)" }}>{c.cliente}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {erroreConferma && <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{erroreConferma}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModalConferma(false)} className="px-4 py-2.5 text-sm font-medium rounded-lg border hover:bg-gray-50">Annulla</button>
              <button
                onClick={confermaOfferta}
                disabled={confermando || !commessaScelta}
                className="px-4 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
                style={{ background: "#166534" }}
              >
                {confermando ? "Conferma…" : "Conferma"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
