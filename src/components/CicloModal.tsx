"use client";

import { useEffect, useState } from "react";
import type { Ciclo, CicloFase, RuoloInFase, Vernice } from "@/lib/types";
import BadgeStato from "./BadgeStato";
import { RuoloInFaseBadge } from "./VerniciaturaBadges";
import VerniceSelect from "./VerniceSelect";

const inputCls = "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300";
const labelCls = "block text-xs font-medium mb-1";
const RUOLI_IN_FASE: RuoloInFase[] = ["vernice", "catalizzatore", "diluente", "indurente", "additivo", "altro"];

interface ProdottoLocale { verniceId: string | null; ruoloInFase: RuoloInFase; quantita: string; unita: string; note: string }
interface FaseLocale { ordine: number; nomeFase: string; note: string; prodotti: ProdottoLocale[] }

function nuovaFaseLocale(ordine: number): FaseLocale {
  return { ordine, nomeFase: "", note: "", prodotti: [{ verniceId: null, ruoloInFase: "vernice", quantita: "", unita: "", note: "" }] };
}

interface Props {
  cicloId: string | null; // null = crea nuovo
  onClose: () => void;
  onSaved: (ciclo: Ciclo) => void;
}

export default function CicloModal({ cicloId, onClose, onSaved }: Props) {
  const [ciclo, setCiclo] = useState<Ciclo | null>(null);
  const [loading, setLoading] = useState(!!cicloId);
  const [vernici, setVernici] = useState<Vernice[]>([]);
  const [nome, setNome] = useState("");
  const [note, setNote] = useState("");
  const [essenza, setEssenza] = useState("");
  const [ignifuga, setIgnifuga] = useState<"" | "si" | "no">("");
  const [fasiLocali, setFasiLocali] = useState<FaseLocale[]>([nuovaFaseLocale(1)]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [azioneInCorso, setAzioneInCorso] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/verniciatura/vernici?includeInattivi=true").then((r) => r.json()).then((v) => Array.isArray(v) && setVernici(v)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!cicloId) return;
    // loading parte già a true (stato iniziale = !!cicloId): niente setLoading(true) qui,
    // cicloId è fisso per la vita del componente (la modale si riapre con una nuova instance).
    fetch(`/api/verniciatura/cicli/${cicloId}`)
      .then((r) => r.json())
      .then((c: Ciclo) => {
        setCiclo(c);
        setNome(c.nome ?? "");
        setNote(c.note ?? "");
        setEssenza(c.essenza ?? "");
        setIgnifuga(c.ignifuga === true ? "si" : c.ignifuga === false ? "no" : "");
      })
      .catch(() => setError("Errore nel caricamento del ciclo"))
      .finally(() => setLoading(false));
  }, [cicloId]);

  const bozza = !ciclo || ciclo.stato === "bozza";

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

  async function creaCiclo() {
    setError("");
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
      const res = await fetch("/api/verniciatura/cicli", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim() || null,
          note: note.trim() || null,
          essenza: essenza.trim() || null,
          ignifuga: ignifuga === "" ? null : ignifuga === "si",
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

  // --- Modifica ciclo esistente (nome/note/essenza/ignifuga sempre; fasi/prodotti solo se bozza) ---

  async function salvaTestata() {
    if (!ciclo) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/verniciatura/cicli/${ciclo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim() || null,
          note: note.trim() || null,
          essenza: essenza.trim() || null,
          ignifuga: ignifuga === "" ? null : ignifuga === "si",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setCiclo(data);
      onSaved(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio.");
    } finally {
      setSaving(false);
    }
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
    if (!ciclo) return;
    const ordine = (ciclo.fasi?.length ? Math.max(...ciclo.fasi.map((f) => f.ordine)) : 0) + 1;
    const data = await eseguiAzione("nuova-fase", () =>
      fetch(`/api/verniciatura/cicli/${ciclo.id}/fasi`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ordine }) })
    );
    if (data) { setCiclo(data); onSaved(data); }
  }

  async function rimuoviFaseRemota(faseId: string) {
    if (!ciclo) return;
    const data = await eseguiAzione(`rm-fase-${faseId}`, () => fetch(`/api/verniciatura/cicli/${ciclo.id}/fasi/${faseId}`, { method: "DELETE" }));
    if (data) { setCiclo(data); onSaved(data); }
  }

  async function aggiungiProdottoRemoto(faseId: string, verniceId: string, ruoloInFase: RuoloInFase, quantita: string, unita: string) {
    if (!ciclo) return;
    const data = await eseguiAzione(`add-prodotto-${faseId}`, () =>
      fetch(`/api/verniciatura/cicli/${ciclo.id}/fasi/${faseId}/prodotti`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verniceId, ruoloInFase, quantita: quantita ? Number(quantita) : null, unita: unita.trim() || null }),
      })
    );
    if (data) { setCiclo(data); onSaved(data); }
  }

  async function rimuoviProdottoRemoto(faseId: string, prodottoId: string) {
    if (!ciclo) return;
    const data = await eseguiAzione(`rm-prodotto-${prodottoId}`, () =>
      fetch(`/api/verniciatura/cicli/${ciclo.id}/fasi/${faseId}/prodotti/${prodottoId}`, { method: "DELETE" })
    );
    if (data) { setCiclo(data); onSaved(data); }
  }

  async function genera_figlio() {
    if (!ciclo) return;
    const data = await eseguiAzione("genera-figlio", () => fetch(`/api/verniciatura/cicli/${ciclo.id}/genera-figlio`, { method: "POST" }));
    if (data) {
      setCiclo(data);
      setNome(data.nome ?? "");
      setNote(data.note ?? "");
      setEssenza(data.essenza ?? "");
      setIgnifuga(data.ignifuga === true ? "si" : data.ignifuga === false ? "no" : "");
      onSaved(data);
    }
  }

  async function valida() {
    if (!ciclo) return;
    setWarnings([]);
    const data = await eseguiAzione("valida", () => fetch(`/api/verniciatura/cicli/${ciclo.id}/valida`, { method: "POST" }));
    if (data) {
      setCiclo(data.ciclo);
      setWarnings(data.warnings ?? []);
      onSaved(data.ciclo);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[92vh]" style={{ borderRadius: "var(--radius-modal)" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-start justify-between sticky top-0 bg-white z-10" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(219,39,119,0.06))" }}>
          <div>
            <h2 className="font-semibold text-base flex items-center gap-2">
              {cicloId ? "Scheda di verniciatura" : "Nuova scheda di verniciatura"}
              {ciclo && <BadgeStato stato={ciclo.stato === "bozza" ? "Bozza" : "Validato"} />}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
              Sequenza ordinata di fasi, ognuna con una o più vernici principali e gli ausiliari (catalizzatore/diluente…) con quantità.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {loading ? (
            <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Nome scheda</label>
                  <input type="text" className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} placeholder='es. "Armadio Gucci laccato"' />
                </div>
                <div>
                  <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Note {ciclo && <span className="normal-case font-normal">(sempre modificabili)</span>}</label>
                  <input type="text" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
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
              {ciclo && (
                <button onClick={salvaTestata} disabled={saving} className="text-xs px-3 py-1.5 rounded-lg font-semibold border disabled:opacity-50" style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", borderColor: "rgba(240,143,37,0.3)" }}>
                  {saving ? "Salvo…" : "Salva nome/note/essenza/ignifuga"}
                </button>
              )}

              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>Fasi</p>

                {!ciclo && fasiLocali.map((f, faseIdx) => (
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
                {!ciclo && (
                  <button type="button" onClick={aggiungiFaseLocale} className="text-sm px-3 py-1.5 rounded-lg font-semibold border" style={{ color: "var(--color-primary)", borderColor: "rgba(240,143,37,0.3)" }}>
                    + Aggiungi fase
                  </button>
                )}

                {ciclo && ciclo.fasi?.map((f: CicloFase) => (
                  <div key={f.id} className="rounded-lg border p-4 space-y-3" style={{ borderColor: "#E4E0DA", background: "#faf9f7" }}>
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">#{f.ordine} — {f.nomeFase || "fase senza nome"}</div>
                      {bozza && (
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
                            <span className="flex-1">{v ? (v.coloreCodice || v.coloreNome || v.famigliaProdotto) : p.verniceId}</span>
                            {p.quantita != null && <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{p.quantita} {p.unita}</span>}
                            {bozza && (
                              <button onClick={() => rimuoviProdottoRemoto(f.id, p.id)} disabled={azioneInCorso === `rm-prodotto-${p.id}`} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1">×</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {bozza && <AggiungiProdottoRemoto vernici={vernici} onAdd={(verniceId, ruolo, qta, unita) => aggiungiProdottoRemoto(f.id, verniceId, ruolo, qta, unita)} loading={azioneInCorso === `add-prodotto-${f.id}`} />}
                  </div>
                ))}
                {ciclo && bozza && (
                  <button onClick={aggiungiFaseRemota} disabled={azioneInCorso === "nuova-fase"} className="text-sm px-3 py-1.5 rounded-lg font-semibold border disabled:opacity-50" style={{ color: "var(--color-primary)", borderColor: "rgba(240,143,37,0.3)" }}>
                    + Aggiungi fase
                  </button>
                )}
              </div>

              {warnings.length > 0 && (
                <div className="rounded-lg border p-3 space-y-1" style={{ background: "#FEF3C7", borderColor: "#FCD34D" }}>
                  <p className="text-xs font-semibold" style={{ color: "#92400E" }}>Avvisi (non bloccanti):</p>
                  {warnings.map((w, i) => <p key={i} className="text-xs" style={{ color: "#92400E" }}>· {w}</p>)}
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex flex-wrap justify-end gap-3 pt-2 border-t" style={{ borderColor: "#E4E0DA" }}>
                {ciclo && bozza && (
                  <button onClick={valida} disabled={azioneInCorso === "valida"} className="px-4 py-2 text-sm rounded font-medium text-white disabled:opacity-60" style={{ background: "#166534", borderRadius: "var(--radius-button)" }}>
                    {azioneInCorso === "valida" ? "Validazione…" : "Valida ciclo"}
                  </button>
                )}
                {ciclo && ciclo.stato === "validato" && (
                  <button onClick={genera_figlio} disabled={azioneInCorso === "genera-figlio"} className="px-4 py-2 text-sm rounded font-medium text-white disabled:opacity-60" style={{ background: "linear-gradient(135deg, #7C3AED, #DB2777)", borderRadius: "var(--radius-button)" }}>
                    {azioneInCorso === "genera-figlio" ? "Creazione…" : "Genera nuova versione"}
                  </button>
                )}
                {!ciclo && (
                  <button onClick={creaCiclo} disabled={saving} className="px-4 py-2 text-sm rounded font-medium text-white disabled:opacity-60" style={{ background: saving ? "var(--color-grey-mid)" : "linear-gradient(135deg, #7C3AED, #DB2777)", borderRadius: "var(--radius-button)" }}>
                    {saving ? "Creazione…" : "Crea ciclo"}
                  </button>
                )}
                <button onClick={onClose} className="px-4 py-2 text-sm rounded border font-medium hover:bg-gray-50 transition-colors">Chiudi</button>
              </div>
            </>
          )}
        </div>
      </div>
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
