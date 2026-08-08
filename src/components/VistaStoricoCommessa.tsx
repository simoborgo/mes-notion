"use client";

import { useMemo, useState } from "react";

interface CommessaOpzione {
  id: string;
  numeroCommessa: string;
  cliente: string;
}

interface RigaArticolo {
  codiceArticolo: string | null;
  numeroScheda: string | null;
  ore: number;
  oreRifacimento: number;
}

interface RigaOperatore {
  matricola: string;
  cognome: string;
  nome: string;
  ore: number;
}

interface Risultato {
  commessa: { id: string; numeroCommessa: string; cliente: string };
  totali: { oreTotali: number; oreRifacimento: number; costoTotale: number };
  perArticolo: RigaArticolo[];
  perOperatore: RigaOperatore[];
}

const inputCls = "rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

export default function VistaStoricoCommessa({ commesse }: { commesse: CommessaOpzione[] }) {
  const [commessaScelta, setCommessaScelta] = useState<CommessaOpzione | null>(null);
  const [searchCommessa, setSearchCommessa] = useState("");
  const [risultato, setRisultato] = useState<Risultato | null>(null);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const commesseFiltrate = useMemo(() => {
    const q = searchCommessa.toLowerCase().trim();
    if (!q) return commesse.slice(0, 20);
    return commesse.filter(c => `${c.numeroCommessa} ${c.cliente}`.toLowerCase().includes(q)).slice(0, 20);
  }, [commesse, searchCommessa]);

  async function seleziona(c: CommessaOpzione) {
    setCommessaScelta(c);
    setRisultato(null);
    setErrore(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/ore/storico-commessa?commessaId=${encodeURIComponent(c.id)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setRisultato(json);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore ricerca");
    } finally {
      setLoading(false);
    }
  }

  function cambiaCommessa() {
    setCommessaScelta(null);
    setRisultato(null);
    setErrore(null);
    setSearchCommessa("");
  }

  return (
    <div className="space-y-4">
      {commessaScelta ? (
        <div className="flex items-center gap-2 px-3 rounded-lg border text-base font-medium" style={{ height: 48, maxWidth: 420, borderColor: "var(--color-primary)", background: "rgba(240,143,37,0.06)" }}>
          <span className="flex-1 min-w-0 truncate">{commessaScelta.numeroCommessa} — {commessaScelta.cliente}</span>
          <button onClick={cambiaCommessa} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
      ) : (
        <div className="space-y-1" style={{ maxWidth: 420 }}>
          <input
            type="text" className={inputCls} style={{ width: "100%", height: 48 }}
            placeholder="Cerca commessa…" value={searchCommessa}
            onChange={e => setSearchCommessa(e.target.value)}
          />
          <div className="rounded-lg border overflow-y-auto" style={{ borderColor: "#d1d5db", maxHeight: 260 }}>
            {commesseFiltrate.map(c => (
              <button
                key={c.id}
                onClick={() => seleziona(c)}
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

      {loading && <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Ricerca…</p>}

      {errore && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }}>
          {errore}
        </div>
      )}

      {risultato && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3" style={{ borderColor: "#e5e4e0" }}>
              <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-grey-mid)" }}>Ore totali</div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-black)" }}>{risultato.totali.oreTotali}h</div>
            </div>
            <div className="rounded-lg border p-3" style={{ borderColor: "#e5e4e0" }}>
              <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-grey-mid)" }}>Ore rifacimento</div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: "#991B1B" }}>{risultato.totali.oreRifacimento}h</div>
            </div>
            <div className="rounded-lg border p-3" style={{ borderColor: "#e5e4e0" }}>
              <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-grey-mid)" }}>Costo totale</div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-black)" }}>€{risultato.totali.costoTotale.toFixed(0)}</div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-grey-mid)" }}>Per codice articolo</h3>
            {risultato.perArticolo.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: "var(--color-grey-mid)" }}>Nessuna ora registrata su questa commessa</p>
            ) : (
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: "#e5e4e0" }}>
                {risultato.perArticolo.map((r, i) => {
                  const nonClassificato = !r.codiceArticolo;
                  const pct = risultato.totali.oreTotali > 0 ? (r.ore / risultato.totali.oreTotali) * 100 : 0;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between px-4 py-2 text-sm border-b last:border-0"
                      style={{ borderColor: "#f0efec", background: nonClassificato ? "#FFFBEB" : "transparent" }}
                    >
                      <div className="min-w-0">
                        <span className="font-semibold" style={{ color: nonClassificato ? "#92400E" : "var(--color-black)" }}>
                          {nonClassificato ? `NON CLASSIFICATO — ${r.numeroScheda}` : r.codiceArticolo}
                        </span>
                        <span className="ml-2 text-xs" style={{ color: "var(--color-grey-mid)" }}>{pct.toFixed(0)}%</span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="font-semibold tabular-nums">{r.ore}h</span>
                        {r.oreRifacimento > 0 && (
                          <span className="ml-2 text-xs font-medium tabular-nums" style={{ color: "#991B1B" }}>({r.oreRifacimento}h rif.)</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-grey-mid)" }}>Per operatore</h3>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: "#e5e4e0" }}>
              {risultato.perOperatore.map(o => (
                <div key={o.matricola} className="flex justify-between px-4 py-2 text-sm border-b last:border-0" style={{ borderColor: "#f0efec" }}>
                  <span>{o.cognome} {o.nome}</span>
                  <span className="font-semibold tabular-nums">{o.ore}h</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
