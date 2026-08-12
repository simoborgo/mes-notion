"use client";

import { useEffect, useMemo, useState } from "react";
import type { Operatore } from "@/lib/types";
import { CATEGORIA_ODP_LABEL } from "@/lib/types";

interface Voce {
  id: string;
  data: string;
  odp: string;
  categoria: string;
  ore: number;
  rif: boolean;
  causale: string | null;
  codiceArticolo: string | null;
}

function fmt(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("it-IT");
}

const inputCls = "rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

export default function VistaStoricoOperatore() {
  const [operatori, setOperatori] = useState<Operatore[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [selezionato, setSelezionato] = useState<Operatore | null>(null);
  const [da, setDa] = useState("");
  const [a, setA] = useState("");
  const [voci, setVoci] = useState<Voce[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/ore/operatori").then(r => r.json()).then(setOperatori).catch(() => {});
  }, []);

  const filtrati = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return operatori.slice(0, 30);
    return operatori.filter(o => `${o.cognome} ${o.nome} ${o.matricola}`.toLowerCase().includes(q)).slice(0, 30);
  }, [operatori, search]);

  async function carica(matricola: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ matricola });
      if (da) params.set("da", da);
      if (a) params.set("a", a);
      const res = await fetch(`/api/ore/storico-operatore?${params}`);
      const json = await res.json();
      if (res.ok) setVoci(json);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selezionato) carica(selezionato.matricola);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selezionato, da, a]);

  const totaleOre = voci?.reduce((s, v) => s + v.ore, 0) ?? 0;
  const giorniLavorati = voci ? new Set(voci.map(v => v.data)).size : 0;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative" style={{ width: 280 }}>
          {selezionato ? (
            <div className="flex items-center gap-2 px-3 rounded-lg border text-sm font-medium" style={{ height: 48, borderColor: "var(--color-primary)", background: "rgba(240,143,37,0.06)" }}>
              <span className="flex-1 truncate">{selezionato.cognome} {selezionato.nome}</span>
              <button onClick={() => { setSelezionato(null); setVoci(null); }} className="text-gray-400 hover:text-gray-600">×</button>
            </div>
          ) : (
            <>
              <input
                type="text" className={inputCls} style={{ height: 48, width: "100%" }}
                placeholder="Cerca operatore…"
                value={search}
                onChange={e => { setSearch(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
              />
              {open && filtrati.length > 0 && (
                <ul className="absolute z-50 w-full mt-1 rounded-lg border bg-white shadow-lg overflow-y-auto" style={{ borderColor: "#d1d5db", maxHeight: 260 }}>
                  {filtrati.map(o => (
                    <li key={o.id} className="px-3 py-2 text-sm cursor-pointer hover:bg-orange-50"
                      onMouseDown={e => { e.preventDefault(); setSelezionato(o); setSearch(""); setOpen(false); }}>
                      <span className="font-semibold">{o.cognome} {o.nome}</span>
                      <span className="ml-2 text-xs" style={{ color: "var(--color-grey-mid)" }}>{o.reparto}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <input type="date" className={inputCls} style={{ height: 48 }} value={da} onChange={e => setDa(e.target.value)} title="Da" />
        <span className="text-sm" style={{ color: "var(--color-grey-mid)" }}>→</span>
        <input type="date" className={inputCls} style={{ height: 48 }} value={a} onChange={e => setA(e.target.value)} title="A" />
      </div>

      {loading && <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</p>}

      {voci && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3" style={{ borderColor: "#e5e4e0" }}>
              <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-grey-mid)" }}>Ore totali</div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-black)" }}>{totaleOre}h</div>
            </div>
            <div className="rounded-lg border p-3" style={{ borderColor: "#e5e4e0" }}>
              <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-grey-mid)" }}>Giorni lavorati</div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-black)" }}>{giorniLavorati}</div>
            </div>
          </div>

          <div className="rounded-lg border overflow-hidden" style={{ borderColor: "#e5e4e0" }}>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase" style={{ background: "#faf9f7", color: "var(--color-grey-mid)" }}>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2">ODP</th>
                  <th className="px-4 py-2">Cod. Articolo</th>
                  <th className="px-4 py-2">Ore</th>
                  <th className="px-4 py-2">RIF</th>
                </tr>
              </thead>
              <tbody>
                {voci.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center" style={{ color: "var(--color-grey-mid)" }}>Nessuna registrazione nel periodo</td></tr>
                ) : voci.map(v => {
                  const nonClassificato = v.categoria === "COMMESSA" && !v.codiceArticolo;
                  return (
                    <tr key={v.id} className="border-t" style={{ borderColor: "#f0efec", background: nonClassificato ? "#FFFBEB" : "transparent" }}>
                      <td className="px-4 py-2 tabular-nums">{fmt(v.data)}</td>
                      <td className="px-4 py-2 font-semibold">{v.odp}</td>
                      <td className="px-4 py-2" style={nonClassificato ? { color: "#92400E", fontWeight: 700 } : undefined}>
                        {v.categoria !== "COMMESSA" ? (CATEGORIA_ODP_LABEL[v.categoria] ?? v.categoria) : nonClassificato ? "NON CLASSIFICATO" : v.codiceArticolo}
                      </td>
                      <td className="px-4 py-2 tabular-nums">{v.ore}h</td>
                      <td className="px-4 py-2">{v.rif ? `RIF${v.causale ? ` (${v.causale})` : ""}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
