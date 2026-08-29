"use client";

import { useEffect, useRef, useState } from "react";
import type { Commessa, RuoloInFase, Scheda, SchedaFase, SchedaVerniciatura, StatoSchedaVerniciatura, Vernice } from "@/lib/types";
import BadgeStato from "./BadgeStato";
import ClienteVerniciaturaAutocomplete from "./ClienteVerniciaturaAutocomplete";
import CommessaAutocomplete from "./CommessaAutocomplete";
import { RuoloInFaseBadge } from "./VerniciaturaBadges";
import VerniceSelect from "./VerniceSelect";

const inputCls = "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300";
const labelCls = "block text-xs font-medium mb-1";
// Stile comune a tutti i bottoni della barra azioni in fondo alla modale — solo dimensioni/forma,
// colori assegnati per famiglia semantica al punto di utilizzo (vedi commento sopra la barra).
const btnCls = "px-4 py-2 text-sm rounded font-semibold border disabled:opacity-50 transition-colors";
const RUOLI_IN_FASE: RuoloInFase[] = ["vernice", "catalizzatore", "diluente", "indurente", "additivo", "altro"];
const STATO_LABEL: Record<StatoSchedaVerniciatura, string> = { bozza: "Bozza", in_revisione: "In revisione", approvato: "Approvato", rifiutato: "Rifiutato" };

interface ProdottoLocale { verniceId: string | null; ruoloInFase: RuoloInFase; quantita: string; unita: string; note: string }
interface FaseLocale { ordine: number; nomeFase: string; note: string; prodotti: ProdottoLocale[] }

function nuovaFaseLocale(ordine: number): FaseLocale {
  return { ordine, nomeFase: "", note: "", prodotti: [{ verniceId: null, ruoloInFase: "vernice", quantita: "", unita: "", note: "" }] };
}

interface Props {
  schedaId: string | null; // null = crea nuova
  onClose: () => void;
  onSaved: (scheda: SchedaVerniciatura) => void;
  // Riceve TUTTI gli id disattivati: eliminare cancella l'intera storia versioni della scheda
  // (bozze/rifiutate/approvate insieme), non solo quella aperta — vedi eliminaScheda sotto.
  onDeleted?: (ids: string[]) => void;
}

export default function SchedaVerniciaturaModal({ schedaId, onClose, onSaved, onDeleted }: Props) {
  const [scheda, setScheda] = useState<SchedaVerniciatura | null>(null);
  const [loading, setLoading] = useState(!!schedaId);
  const [vernici, setVernici] = useState<Vernice[]>([]);
  const [clienti, setClienti] = useState<string[]>([]);
  const [commesseList, setCommesseList] = useState<Commessa[]>([]);
  const [nome, setNome] = useState("");
  const [note, setNote] = useState("");
  const [essenza, setEssenza] = useState("");
  const [ignifuga, setIgnifuga] = useState<"" | "si" | "no">("");
  const [cliente, setCliente] = useState("");
  const [commessaId, setCommessaId] = useState<string | null>(null);
  const [codiceCampioneMaterialista, setCodiceCampioneMaterialista] = useState("");
  const [dataProva, setDataProva] = useState(() => new Date().toISOString().slice(0, 10));
  const [forzaNuovoBarcode, setForzaNuovoBarcode] = useState(false);
  const [fasiLocali, setFasiLocali] = useState<FaseLocale[]>([nuovaFaseLocale(1)]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [azioneInCorso, setAzioneInCorso] = useState<string | null>(null);
  const [versioniPrecedenti, setVersioniPrecedenti] = useState<SchedaVerniciatura[]>([]);
  const [odpCollegati, setOdpCollegati] = useState<Scheda[]>([]);
  const [versionePrecedenteAperta, setVersionePrecedenteAperta] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/verniciatura/vernici?includeInattivi=true").then((r) => r.json()).then((v) => Array.isArray(v) && setVernici(v)).catch(() => {});
    fetch("/api/verniciatura/schede/clienti").then((r) => r.json()).then((c) => Array.isArray(c) && setClienti(c)).catch(() => {});
    fetch("/api/commesse").then((r) => r.json()).then((c) => Array.isArray(c) && setCommesseList(c)).catch(() => {});
  }, []);

  // "Commessa su scheda verniciatura ... così si prende anche Cliente": alla selezione di una
  // commessa, se il Cliente è ancora vuoto lo precompila col testo libero della Commessa — solo
  // un suggerimento, resta comunque modificabile prima di creare (il Cliente Verniciatura è una
  // FK indipendente su clienti_verniciatura, non un mirror di Commessa.cliente).
  function selezionaCommessa(id: string | null) {
    setCommessaId(id);
    if (id && !cliente) {
      const c = commesseList.find((x) => x.id === id);
      if (c?.cliente) setCliente(c.cliente);
    }
  }

  useEffect(() => {
    if (!schedaId) return;
    // loading parte già a true (stato iniziale = !!schedaId): niente setLoading(true) qui,
    // schedaId è fisso per la vita del componente (la modale si riapre con una nuova instance).
    fetch(`/api/verniciatura/schede/${schedaId}`)
      .then((r) => r.json())
      .then((s: SchedaVerniciatura) => {
        setScheda(s);
        setNome(s.nome ?? "");
        setNote(s.note ?? "");
        setEssenza(s.essenza ?? "");
        setIgnifuga(s.ignifuga === true ? "si" : s.ignifuga === false ? "no" : "");
        setCliente(s.cliente ?? "");
        setCommessaId(s.commessaId);
        setCodiceCampioneMaterialista(s.codiceCampioneMaterialista ?? "");
        setDataProva(s.dataProva);
      })
      .catch(() => setError("Errore nel caricamento della scheda"))
      .finally(() => setLoading(false));
  }, [schedaId]);

  // Risale la catena scheda_padre_id per mostrare lo storico versioni "dentro" la scheda
  // corrente — solo UI, nessuna logica nuova: riusa la GET per id già esistente.
  useEffect(() => {
    if (!scheda?.schedaPadreId) { setVersioniPrecedenti([]); return; }
    let cancelled = false;
    async function caricaVersioniPrecedenti() {
      const catena: SchedaVerniciatura[] = [];
      let padreId: string | null = scheda!.schedaPadreId;
      while (padreId) {
        const res = await fetch(`/api/verniciatura/schede/${padreId}`);
        if (!res.ok) break;
        const padre: SchedaVerniciatura = await res.json();
        catena.unshift(padre);
        padreId = padre.schedaPadreId;
      }
      if (!cancelled) setVersioniPrecedenti(catena);
    }
    caricaVersioniPrecedenti();
    return () => { cancelled = true; };
  }, [scheda?.id, scheda?.schedaPadreId]);

  // "Usata in questi ODP": lettura reverse di schede.scheda_verniciatura_id — sola lettura,
  // mostrata solo quando non vuota (vedi VerniciaturaOdpTab.tsx per il lato scrittura sull'ODP).
  useEffect(() => {
    if (!scheda) { setOdpCollegati([]); return; }
    let cancelled = false;
    fetch(`/api/verniciatura/schede/${scheda.id}/odp`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled && Array.isArray(data)) setOdpCollegati(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [scheda?.id]);

  const mutabile = !scheda || scheda.stato === "bozza" || scheda.stato === "in_revisione";
  const bloccata = !!scheda && (scheda.stato === "approvato" || scheda.stato === "rifiutato");

  // --- Creazione (fasi costruite in locale, inviate tutte insieme) ---

  function aggiornaFaseLocale(idx: number, patch: Partial<FaseLocale>) {
    setFasiLocali((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }
  function aggiornaProdottoLocale(faseIdx: number, prodIdx: number, patch: Partial<ProdottoLocale>) {
    setFasiLocali((prev) => prev.map((f, i) => i !== faseIdx ? f : { ...f, prodotti: f.prodotti.map((p, j) => (j === prodIdx ? { ...p, ...patch } : p)) }));
  }
  function aggiungiProdottoLocale(faseIdx: number) {
    setFasiLocali((prev) => prev.map((f, i) => i !== faseIdx ? f : { ...f, prodotti: [...f.prodotti, { verniceId: null, ruoloInFase: "catalizzatore", quantita: "", unita: "", note: "" }] }));
  }
  function rimuoviProdottoLocale(faseIdx: number, prodIdx: number) {
    setFasiLocali((prev) => prev.map((f, i) => i !== faseIdx ? f : { ...f, prodotti: f.prodotti.filter((_, j) => j !== prodIdx) }));
  }
  function aggiungiFaseLocale() {
    setFasiLocali((prev) => [...prev, nuovaFaseLocale(prev.length ? Math.max(...prev.map((f) => f.ordine)) + 1 : 1)]);
  }
  function rimuoviFaseLocale(idx: number) {
    setFasiLocali((prev) => prev.filter((_, i) => i !== idx));
  }

  async function creaScheda() {
    setError("");
    if (!cliente) { setError("Seleziona un cliente."); return; }
    for (const f of fasiLocali) {
      if (!f.prodotti.some((p) => p.ruoloInFase === "vernice" && p.verniceId)) {
        setError(`La fase con ordine ${f.ordine} deve avere almeno una vernice principale.`);
        return;
      }
      for (const p of f.prodotti) {
        if (!p.verniceId) { setError("Ogni prodotto deve avere una vernice selezionata."); return; }
      }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/verniciatura/schede", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim() || null,
          note: note.trim() || null,
          essenza: essenza.trim() || null,
          ignifuga: ignifuga === "" ? null : ignifuga === "si",
          cliente,
          commessaId,
          codiceCampioneMaterialista: codiceCampioneMaterialista.trim() || null,
          dataProva,
          forzaNuovoBarcode,
          fasi: fasiLocali.map((f) => ({
            ordine: f.ordine,
            nomeFase: f.nomeFase.trim() || null,
            note: f.note.trim() || null,
            prodotti: f.prodotti.map((p) => ({
              verniceId: p.verniceId,
              ruoloInFase: p.ruoloInFase,
              quantita: p.quantita ? Number(p.quantita) : null,
              unita: p.unita.trim() || null,
              note: p.note.trim() || null,
            })),
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      onSaved(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la creazione.");
    } finally {
      setSaving(false);
    }
  }

  // --- Modifica scheda esistente ---

  // Confronta i campi testata modificabili con l'ultimo stato salvato (scheda) — governa se
  // "Salva" è attivo. Su cliente/commessa/nome/... alla creazione non si applica (bottone diverso,
  // "Crea scheda", sempre attivo se il form è valido).
  const testataModificata = !!scheda && (
    nome !== (scheda.nome ?? "") ||
    note !== (scheda.note ?? "") ||
    essenza !== (scheda.essenza ?? "") ||
    (ignifuga === "" ? null : ignifuga === "si") !== scheda.ignifuga ||
    codiceCampioneMaterialista !== (scheda.codiceCampioneMaterialista ?? "") ||
    dataProva !== scheda.dataProva
  );
  // Stesso concetto in modalità creazione: form ancora "vuoto" (nessun campo toccato, nessuna
  // vernice scelta) vs form in corso di compilazione — governa se il click sul backdrop può
  // chiudere senza chiedere conferma (vedi hasUnsavedChanges sotto).
  const creazioneIniziata = !scheda && (
    nome.trim() !== "" ||
    note.trim() !== "" ||
    essenza.trim() !== "" ||
    ignifuga !== "" ||
    cliente.trim() !== "" ||
    commessaId !== null ||
    codiceCampioneMaterialista.trim() !== "" ||
    forzaNuovoBarcode ||
    fasiLocali.some((f) => f.nomeFase.trim() !== "" || f.note.trim() !== "" || f.prodotti.some((p) => p.verniceId !== null || p.quantita !== "" || p.unita !== "" || p.note.trim() !== ""))
  );
  const hasUnsavedChanges = testataModificata || creazioneIniziata;

  async function salvaTestata(): Promise<boolean> {
    if (!scheda) return false;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/verniciatura/schede/${scheda.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim() || null,
          note: note.trim() || null,
          essenza: essenza.trim() || null,
          ignifuga: ignifuga === "" ? null : ignifuga === "si",
          codiceCampioneMaterialista: codiceCampioneMaterialista.trim() || null,
          dataProva,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setScheda(data);
      onSaved(data);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  // "Salva e chiudi" fusi in un solo bottone: se non ci sono modifiche non c'è nulla da salvare
  // (il bottone resta disattivo, si chiude con la × in alto); se il salvataggio fallisce la
  // modale resta aperta con l'errore visibile invece di chiudersi silenziosamente perdendo i dati.
  async function salvaEChiudi() {
    if (!testataModificata) { onClose(); return; }
    const ok = await salvaTestata();
    if (ok) onClose();
  }

  async function eseguiAzione(chiave: string, fn: () => Promise<Response>) {
    setAzioneInCorso(chiave);
    setError("");
    try {
      const res = await fn();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
      return null;
    } finally {
      setAzioneInCorso(null);
    }
  }

  async function aggiungiFaseRemota() {
    if (!scheda) return;
    const ordine = (scheda.fasi?.length ? Math.max(...scheda.fasi.map((f) => f.ordine)) : 0) + 1;
    const data = await eseguiAzione("nuova-fase", () =>
      fetch(`/api/verniciatura/schede/${scheda.id}/fasi`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ordine }) })
    );
    if (data) { setScheda(data); onSaved(data); }
  }

  async function rimuoviFaseRemota(faseId: string) {
    if (!scheda) return;
    const data = await eseguiAzione(`rm-fase-${faseId}`, () => fetch(`/api/verniciatura/schede/${scheda.id}/fasi/${faseId}`, { method: "DELETE" }));
    if (data) { setScheda(data); onSaved(data); }
  }

  async function aggiungiProdottoRemoto(faseId: string, verniceId: string, ruoloInFase: RuoloInFase, quantita: string, unita: string) {
    if (!scheda) return;
    const data = await eseguiAzione(`add-prodotto-${faseId}`, () =>
      fetch(`/api/verniciatura/schede/${scheda.id}/fasi/${faseId}/prodotti`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verniceId, ruoloInFase, quantita: quantita ? Number(quantita) : null, unita: unita.trim() || null }),
      })
    );
    if (data) { setScheda(data); onSaved(data); }
  }

  async function rimuoviProdottoRemoto(faseId: string, prodottoId: string) {
    if (!scheda) return;
    const data = await eseguiAzione(`rm-prodotto-${prodottoId}`, () =>
      fetch(`/api/verniciatura/schede/${scheda.id}/fasi/${faseId}/prodotti/${prodottoId}`, { method: "DELETE" })
    );
    if (data) { setScheda(data); onSaved(data); }
  }

  async function generaFiglio() {
    if (!scheda) return;
    const data = await eseguiAzione("genera-figlio", () => fetch(`/api/verniciatura/schede/${scheda.id}/genera-figlio`, { method: "POST" }));
    if (data) {
      setScheda(data);
      setNome(data.nome ?? "");
      setNote(data.note ?? "");
      setEssenza(data.essenza ?? "");
      setIgnifuga(data.ignifuga === true ? "si" : data.ignifuga === false ? "no" : "");
      setCliente(data.cliente ?? "");
      setCommessaId(data.commessaId);
      setCodiceCampioneMaterialista(data.codiceCampioneMaterialista ?? "");
      setDataProva(data.dataProva);
      onSaved(data);
    }
  }

  // Duplica il contenuto (fasi/vernici + essenza/ignifuga) come punto di partenza per una scheda
  // NUOVA e indipendente — a differenza di genera-figlio, non è una nuova versione della stessa
  // scheda: nessun scheda_padre_id, cliente da scegliere ex novo, barcode nuovo (o riusato se lo
  // stesso cliente/vernici esistono già altrove). Disponibile in qualsiasi stato: non tocca
  // l'originale, riporta semplicemente la modale in modalità creazione con i campi precompilati.
  function duplicaComeNuova() {
    if (!scheda) return;
    if (!confirm("Duplicare questa scheda? Si aprirà il form di una nuova scheda con fasi e vernici precompilate, cliente da scegliere.")) return;
    const fasiCopia: FaseLocale[] = (scheda.fasi ?? []).map((f) => ({
      ordine: f.ordine,
      nomeFase: f.nomeFase ?? "",
      note: f.note ?? "",
      prodotti: f.prodotti.map((p) => ({
        verniceId: p.verniceId,
        ruoloInFase: p.ruoloInFase,
        quantita: p.quantita != null ? String(p.quantita) : "",
        unita: p.unita ?? "",
        note: p.note ?? "",
      })),
    }));
    setFasiLocali(fasiCopia.length ? fasiCopia : [nuovaFaseLocale(1)]);
    setNome(scheda.nome ? `${scheda.nome} (copia)` : "");
    setNote("");
    setEssenza(scheda.essenza ?? "");
    setIgnifuga(scheda.ignifuga === true ? "si" : scheda.ignifuga === false ? "no" : "");
    setCliente("");
    setCommessaId(null);
    setCodiceCampioneMaterialista("");
    setDataProva(new Date().toISOString().slice(0, 10));
    setForzaNuovoBarcode(false);
    setWarnings([]);
    setError("");
    setScheda(null);
  }

  async function eliminaScheda() {
    if (!scheda) return;
    if (!confirm("Eliminare questa scheda? Verranno eliminate anche TUTTE le altre versioni collegate (bozze, in revisione, approvate, rifiutate) — l'intera storia della scheda, non solo questa versione. Diventeranno inattive e spariranno da tabella e ricerche.")) return;
    setAzioneInCorso("elimina");
    setError("");
    try {
      const res = await fetch(`/api/verniciatura/schede/${scheda.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      onDeleted?.(data.ids ?? [scheda.id]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore eliminazione");
    } finally {
      setAzioneInCorso(null);
    }
  }

  async function impostaStato(stato: StatoSchedaVerniciatura) {
    if (!scheda) return;
    if (stato === "approvato" && !confirm("Approvare questa scheda? Diventerà immutabile: per modificarla servirà generare una nuova versione.")) return;
    if (stato === "rifiutato" && !confirm("Rifiutare questa scheda? Diventerà immutabile: per una nuova prova genera una nuova versione.")) return;
    setWarnings([]);
    const data = await eseguiAzione("stato", () =>
      fetch(`/api/verniciatura/schede/${scheda.id}/stato`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stato }) })
    );
    if (data) {
      setScheda(data.scheda);
      setWarnings(data.warnings ?? []);
      onSaved(data.scheda);
    }
  }

  async function caricaFoto(file: File) {
    if (!scheda) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("foto", file);
      const res = await fetch(`/api/verniciatura/schede/${scheda.id}/foto`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setScheda(data);
      onSaved(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore upload foto");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => { if (!hasUnsavedChanges) onClose(); }}>
      <div className="w-full max-w-3xl bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[92vh]" style={{ borderRadius: "var(--radius-modal)" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-start justify-between sticky top-0 bg-white z-10" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(219,39,119,0.06))" }}>
          <div>
            <h2 className="font-semibold text-base flex items-center gap-2 flex-wrap">
              {scheda ? (scheda.codicePubblico ? <span className="font-mono">{scheda.codicePubblico}</span> : "Scheda di Verniciatura") : "Nuova Scheda di Verniciatura"}
              {scheda && <BadgeStato stato={STATO_LABEL[scheda.stato]} />}
              {scheda && <span className="text-xs font-normal" style={{ color: "var(--color-grey-mid)" }}>v{scheda.versione}</span>}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
              Ciclo (fasi + vernici) + riferimento colore cliente + foto campione, con versioning delle prove fino alla validazione.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {loading ? (
            <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</p>
          ) : (
            <>
              {versioniPrecedenti.length > 0 && (
                <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "#E4E0DA", background: "#faf9f7" }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>
                    Versioni precedenti ({versioniPrecedenti.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {versioniPrecedenti.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setVersionePrecedenteAperta(v.id)}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs hover:bg-white transition-colors"
                        style={{ borderColor: "#E4E0DA", background: "white" }}
                      >
                        <span className="font-semibold">v{v.versione}</span>
                        <BadgeStato stato={STATO_LABEL[v.stato]} />
                        <span style={{ color: "var(--color-grey-mid)" }}>{new Date(v.dataProva).toLocaleDateString("it-IT")}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {odpCollegati.length > 0 && (
                <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "#E4E0DA", background: "#faf9f7" }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>
                    Usata in questi ODP ({odpCollegati.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {odpCollegati.map((o) => (
                      <div
                        key={o.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs"
                        style={{ borderColor: "#E4E0DA", background: "white" }}
                      >
                        <span className="font-semibold">{o.odp}</span>
                        {o.clienteInfo && <span style={{ color: "var(--color-grey-mid)" }}>{o.clienteInfo}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Cliente *{scheda && <span className="normal-case font-normal"> (fisso, ereditato dalle prove successive)</span>}</label>
                  {scheda ? (
                    <div className="flex items-center gap-2 px-3 rounded-lg border text-sm font-medium" style={{ height: 40, borderColor: "#E4E0DA", background: "#faf9f7" }}>
                      {scheda.cliente || "— nessun cliente —"}
                    </div>
                  ) : (
                    <ClienteVerniciaturaAutocomplete clienti={clienti} value={cliente} onChange={setCliente} />
                  )}
                </div>
                <div>
                  <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Cod. Material List</label>
                  <input type="text" className={inputCls} value={codiceCampioneMaterialista} onChange={(e) => setCodiceCampioneMaterialista(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Commessa {scheda && <span className="normal-case font-normal">(fissa, ereditata dalle prove successive)</span>}</label>
                  {scheda ? (
                    <div className="flex items-center gap-2 px-3 rounded-lg border text-sm font-medium" style={{ height: 40, borderColor: "#E4E0DA", background: "#faf9f7" }}>
                      {scheda.numeroCommessa || "— nessuna commessa —"}
                    </div>
                  ) : (
                    <CommessaAutocomplete commesseList={commesseList} value={commessaId} onChange={selezionaCommessa} />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Nome scheda</label>
                  <input type="text" className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} placeholder='es. "Armadio Gucci laccato"' />
                </div>
                <div>
                  <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data prova</label>
                  <input type="date" className={inputCls} value={dataProva} onChange={(e) => setDataProva(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Essenza</label>
                  <input type="text" className={inputCls} value={essenza} onChange={(e) => setEssenza(e.target.value)} placeholder="es. Teak, Noce Americano…" />
                </div>
                <div>
                  <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Ignifuga</label>
                  <select className={inputCls} value={ignifuga} onChange={(e) => setIgnifuga(e.target.value as "" | "si" | "no")}>
                    <option value="">— Non specificato —</option>
                    <option value="si">Sì</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Note {scheda && <span className="normal-case font-normal">(sempre modificabili)</span>}</label>
                <input type="text" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              {!scheda && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={forzaNuovoBarcode} onChange={(e) => setForzaNuovoBarcode(e.target.checked)} className="w-4 h-4 accent-orange-500" />
                  Forza un nuovo barcode (non riusare uno esistente per stesso cliente/vernici)
                </label>
              )}
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>Fasi e vernici</p>

                {!scheda && fasiLocali.map((f, faseIdx) => (
                  <div key={faseIdx} className="rounded-lg border p-4 space-y-3" style={{ borderColor: "#E4E0DA", background: "#faf9f7" }}>
                    <div className="flex gap-3 items-end">
                      <div className="w-20">
                        <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Ordine</label>
                        <input type="number" className={inputCls} value={f.ordine} onChange={(e) => aggiornaFaseLocale(faseIdx, { ordine: Number(e.target.value) })} />
                      </div>
                      <div className="flex-1">
                        <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Nome fase</label>
                        <input type="text" className={inputCls} value={f.nomeFase} onChange={(e) => aggiornaFaseLocale(faseIdx, { nomeFase: e.target.value })} placeholder="fondo, sfumatura, finitura… (usa fasi separate per passaggi sequenziali distinti, es. Fondo 1 / Fondo 2)" />
                      </div>
                      {fasiLocali.length > 1 && (
                        <button type="button" onClick={() => rimuoviFaseLocale(faseIdx)} className="text-xs px-2 py-2 rounded border" style={{ color: "#991B1B", borderColor: "#FCA5A5" }}>Rimuovi fase</button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {f.prodotti.map((p, prodIdx) => (
                        <div key={prodIdx} className="flex gap-2 items-center">
                          <div className="flex-1"><VerniceSelect vernici={vernici} value={p.verniceId} onChange={(id) => aggiornaProdottoLocale(faseIdx, prodIdx, { verniceId: id })} /></div>
                          <div className="w-36 shrink-0">
                            <select className={inputCls} value={p.ruoloInFase} onChange={(e) => aggiornaProdottoLocale(faseIdx, prodIdx, { ruoloInFase: e.target.value as RuoloInFase })}>
                              {RUOLI_IN_FASE.map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </div>
                          <div className="w-20 shrink-0">
                            <input type="number" min="0" step="any" placeholder="qtà" className={inputCls} value={p.quantita} onChange={(e) => aggiornaProdottoLocale(faseIdx, prodIdx, { quantita: e.target.value })} />
                          </div>
                          <div className="w-24 shrink-0">
                            <input type="text" placeholder="%, gr, gocce…" className={inputCls} value={p.unita} onChange={(e) => aggiornaProdottoLocale(faseIdx, prodIdx, { unita: e.target.value })} />
                          </div>
                          <button type="button" onClick={() => rimuoviProdottoLocale(faseIdx, prodIdx)} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1">×</button>
                        </div>
                      ))}
                      <button type="button" onClick={() => aggiungiProdottoLocale(faseIdx)} className="text-xs underline" style={{ color: "var(--color-primary)" }}>+ Aggiungi prodotto</button>
                    </div>
                  </div>
                ))}
                {!scheda && (
                  <button type="button" onClick={aggiungiFaseLocale} className="text-sm px-3 py-1.5 rounded-lg font-semibold border" style={{ color: "var(--color-primary)", borderColor: "rgba(240,143,37,0.3)" }}>
                    + Aggiungi fase
                  </button>
                )}

                {scheda && scheda.fasi?.map((f: SchedaFase) => (
                  <div key={f.id} className="rounded-lg border p-4 space-y-3" style={{ borderColor: "#E4E0DA", background: "#faf9f7" }}>
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">#{f.ordine} — {f.nomeFase || "fase senza nome"}</div>
                      {mutabile && (
                        <button onClick={() => rimuoviFaseRemota(f.id)} disabled={azioneInCorso === `rm-fase-${f.id}`} className="text-xs px-2 py-1 rounded border disabled:opacity-50" style={{ color: "#991B1B", borderColor: "#FCA5A5" }}>
                          Rimuovi fase
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {f.prodotti.length === 0 && <p className="text-xs" style={{ color: "#991B1B" }}>Nessun prodotto — manca la vernice principale</p>}
                      {f.prodotti.map((p) => {
                        const v = vernici.find((x) => x.id === p.verniceId);
                        return (
                          <div key={p.id} className="flex items-center gap-2 text-sm">
                            <RuoloInFaseBadge ruolo={p.ruoloInFase} />
                            <span className="flex-1">
                              {v ? (
                                <>
                                  {[v.coloreCodice, v.descrizioneColore].filter(Boolean).join(" · ") || v.tipologia}
                                  {(v.codiceInventario || v.codiceTintometro) && (
                                    <span className="text-xs ml-1.5" style={{ color: "var(--color-grey-mid)" }}>
                                      {[v.codiceInventario && `Cod. Inv. ${v.codiceInventario}`, v.codiceTintometro && `Tintometro ${v.codiceTintometro}`].filter(Boolean).join(" · ")}
                                    </span>
                                  )}
                                </>
                              ) : p.verniceId}
                            </span>
                            {p.quantita != null && <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{p.quantita} {p.unita}</span>}
                            {mutabile && (
                              <button onClick={() => rimuoviProdottoRemoto(f.id, p.id)} disabled={azioneInCorso === `rm-prodotto-${p.id}`} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1">×</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {mutabile && <AggiungiProdottoRemoto vernici={vernici} onAdd={(verniceId, ruolo, qta, unita) => aggiungiProdottoRemoto(f.id, verniceId, ruolo, qta, unita)} loading={azioneInCorso === `add-prodotto-${f.id}`} />}
                  </div>
                ))}
                {scheda && mutabile && (
                  <button onClick={aggiungiFaseRemota} disabled={azioneInCorso === "nuova-fase"} className="text-sm px-3 py-1.5 rounded-lg font-semibold border disabled:opacity-50" style={{ color: "var(--color-primary)", borderColor: "rgba(240,143,37,0.3)" }}>
                    + Aggiungi fase
                  </button>
                )}
              </div>

              {scheda && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>Foto campione ({scheda.foto?.length ?? 0})</p>
                  <div className="flex flex-wrap gap-2">
                    {(scheda.foto ?? []).map((f) => (
                      // Proxy autenticato /api/drive-file (stesso usato per copertine ODP altrove
                      // nell'app), non il link diretto a drive.google.com: quest'ultimo richiede
                      // che il viewer abbia accesso Google al file (l'app invece vi accede col
                      // proprio service account) — è la causa del prompt "richiedi accesso".
                      <a key={f.id} href={`/api/drive-file/${f.driveFileId}`} target="_blank" rel="noreferrer" title={f.nomeFile ?? "foto campione"}>
                        <img
                          src={`/api/drive-file/${f.driveFileId}`}
                          alt={f.nomeFile ?? "foto campione"}
                          className="rounded-lg border object-cover hover:opacity-80 transition-opacity"
                          style={{ width: 72, height: 72, borderColor: "#E4E0DA" }}
                        />
                      </a>
                    ))}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) caricaFoto(f); }} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="text-xs underline disabled:opacity-50" style={{ color: "var(--color-primary)" }}>
                    {uploading ? "Carico…" : "+ Carica foto"}
                  </button>
                </div>
              )}

              {warnings.length > 0 && (
                <div className="rounded-lg border p-3 space-y-1" style={{ background: "#FEF3C7", borderColor: "#FCD34D" }}>
                  <p className="text-xs font-semibold" style={{ color: "#92400E" }}>Avvisi (non bloccanti):</p>
                  {warnings.map((w, i) => <p key={i} className="text-xs" style={{ color: "#92400E" }}>· {w}</p>)}
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              {/* Comandi di approvazione a sinistra, azioni scheda (salva+chiudi/elimina) a
                  destra — colori per famiglia: ambra = revisione, rosso chiaro = rifiuta (più
                  leggero di elimina, non è distruttivo), verde = approva, viola = "nuovo record"
                  (duplica/versione successiva), primario = salva/crea, rosso pieno = elimina.
                  Salva è disattivo finché non ci sono modifiche da salvare — senza modifiche
                  chiude e basta, come la × in alto. */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 mt-1 border-t" style={{ borderColor: "#E4E0DA" }}>
                <div className="flex flex-wrap gap-2">
                  {scheda && scheda.stato === "bozza" && (
                    <button onClick={() => impostaStato("in_revisione")} disabled={azioneInCorso === "stato"} className={btnCls} style={{ color: "#92400E", borderColor: "#FCD34D", background: "#FFFBEB" }}>
                      {azioneInCorso === "stato" ? "…" : "Invia in revisione"}
                    </button>
                  )}
                  {scheda && mutabile && (
                    <button onClick={() => impostaStato("rifiutato")} disabled={azioneInCorso === "stato"} className={btnCls} style={{ color: "#991B1B", borderColor: "#FCA5A5", background: "#FEF2F2" }}>
                      {azioneInCorso === "stato" ? "…" : "Rifiuta"}
                    </button>
                  )}
                  {scheda && mutabile && (
                    <button onClick={() => impostaStato("approvato")} disabled={azioneInCorso === "stato"} className={btnCls + " text-white"} style={{ background: "#166534", borderColor: "transparent" }}>
                      {azioneInCorso === "stato" ? "Approvazione…" : "Approva"}
                    </button>
                  )}
                  {scheda && (
                    <button onClick={duplicaComeNuova} className={btnCls} style={{ color: "#7C3AED", borderColor: "#DDD6FE", background: "#FAF5FF" }}>
                      Duplica come nuova scheda
                    </button>
                  )}
                  {bloccata && (
                    <button onClick={generaFiglio} disabled={azioneInCorso === "genera-figlio"} className={btnCls + " text-white"} style={{ background: "linear-gradient(135deg, #7C3AED, #DB2777)", borderColor: "transparent" }}>
                      {azioneInCorso === "genera-figlio" ? "Creazione…" : "Genera nuova versione"}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {scheda && (
                    <button onClick={salvaEChiudi} disabled={saving || !testataModificata} className={btnCls + " text-white"} style={{ background: testataModificata ? "var(--color-primary)" : "var(--color-grey-mid)", borderColor: "transparent" }}>
                      {saving ? "Salvo…" : "Salva"}
                    </button>
                  )}
                  {!scheda && (
                    <button onClick={creaScheda} disabled={saving} className={btnCls + " text-white"} style={{ background: saving ? "var(--color-grey-mid)" : "linear-gradient(135deg, #7C3AED, #DB2777)", borderColor: "transparent" }}>
                      {saving ? "Creazione…" : "Crea scheda"}
                    </button>
                  )}
                  {scheda && (
                    <button onClick={eliminaScheda} disabled={azioneInCorso === "elimina"} className={btnCls + " text-white"} style={{ background: "#DC2626", borderColor: "transparent" }}>
                      {azioneInCorso === "elimina" ? "Elimino…" : "Elimina scheda"}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {versionePrecedenteAperta && (
        <SchedaVerniciaturaModal
          schedaId={versionePrecedenteAperta}
          onClose={() => setVersionePrecedenteAperta(null)}
          onSaved={() => {}}
          onDeleted={(ids) => {
            // L'eliminazione da una versione precedente cancella l'intera lineage: anche la
            // scheda mostrata qui nel modale esterno ne fa parte, quindi non ha più senso
            // restare aperti — si chiude tutto e si propaga alla tabella.
            setVersionePrecedenteAperta(null);
            onDeleted?.(ids);
            onClose();
          }}
        />
      )}
    </div>
  );
}

function AggiungiProdottoRemoto({ vernici, onAdd, loading }: { vernici: Vernice[]; onAdd: (verniceId: string, ruolo: RuoloInFase, quantita: string, unita: string) => void; loading: boolean }) {
  const [verniceId, setVerniceId] = useState<string | null>(null);
  const [ruolo, setRuolo] = useState<RuoloInFase>("vernice");
  const [quantita, setQuantita] = useState("");
  const [unita, setUnita] = useState("");

  return (
    <div className="flex gap-2 items-center pt-1">
      <div className="flex-1"><VerniceSelect vernici={vernici} value={verniceId} onChange={setVerniceId} /></div>
      <div className="w-36 shrink-0">
        <select className={inputCls} value={ruolo} onChange={(e) => setRuolo(e.target.value as RuoloInFase)}>
          {RUOLI_IN_FASE.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="w-20 shrink-0">
        <input type="number" min="0" step="any" placeholder="qtà" className={inputCls} value={quantita} onChange={(e) => setQuantita(e.target.value)} />
      </div>
      <div className="w-24 shrink-0">
        <input type="text" placeholder="%, gr, gocce…" className={inputCls} value={unita} onChange={(e) => setUnita(e.target.value)} />
      </div>
      <button
        type="button"
        disabled={!verniceId || loading}
        onClick={() => { if (verniceId) { onAdd(verniceId, ruolo, quantita, unita); setVerniceId(null); setQuantita(""); setUnita(""); } }}
        className="text-xs px-3 py-2 rounded-lg font-semibold border disabled:opacity-50"
        style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", borderColor: "rgba(240,143,37,0.3)" }}
      >
        {loading ? "…" : "+ Aggiungi"}
      </button>
    </div>
  );
}
