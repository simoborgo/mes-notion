"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import type { FabbisognoArticolo } from "@/lib/kitFerramentaRepository";
import { STATO_APPROVVIGIONAMENTO_LABEL } from "./RigaKitAzioni";

function fmtData(ymd: string) {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

export default function TabellaFabbisogno({ articoli }: { articoli: FabbisognoArticolo[] }) {
  const [search, setSearch] = useState("");
  const [fornitore, setFornitore] = useState("");
  const [soloDaOrdinare, setSoloDaOrdinare] = useState(false);
  const [aperti, setAperti] = useState<Set<string>>(new Set());

  const fornitori = useMemo(
    () => [...new Set(articoli.map(a => a.fornitore).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it")),
    [articoli]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return articoli.filter(a =>
      (!q || `${a.descrizione} ${a.codiceOs1}`.toLowerCase().includes(q)) &&
      (!fornitore || a.fornitore === fornitore) &&
      (!soloDaOrdinare || (a.mancante ?? 0) > 0)
    );
  }, [articoli, search, fornitore, soloDaOrdinare]);

  const daOrdinare = useMemo(() => articoli.filter(a => (a.mancante ?? 0) > 0).length, [articoli]);

  function toggle(chiave: string) {
    setAperti(prev => {
      const next = new Set(prev);
      if (next.has(chiave)) next.delete(chiave); else next.add(chiave);
      return next;
    });
  }

  const inputCls = "border rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <input className={inputCls + " min-w-52"} placeholder="Cerca articolo o codice…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={inputCls} value={fornitore} onChange={(e) => setFornitore(e.target.value)}>
          <option value="">Tutti i fornitori</option>
          {fornitori.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
          <input type="checkbox" className="accent-orange-500" checked={soloDaOrdinare} onChange={(e) => setSoloDaOrdinare(e.target.checked)} />
          Solo da ordinare ({daOrdinare})
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <th className="px-4 py-3">Articolo</th>
              <th className="px-4 py-3">Fornitore</th>
              <th className="px-4 py-3 text-right">Da preparare</th>
              <th className="px-4 py-3 text-right">Giacenza</th>
              <th className="px-4 py-3 text-right">Da ordinare</th>
              <th className="px-4 py-3">ODP</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Niente da preparare
                </td>
              </tr>
            ) : filtered.map(a => {
              const aperto = aperti.has(a.chiave);
              const manca = (a.mancante ?? 0) > 0;
              return (
                <Fragment key={a.chiave}>
                  <tr className="border-b last:border-0 align-top">
                    <td className="px-4 py-3 font-medium">
                      {a.descrizione}
                      <div className="text-xs font-mono" style={{ color: "var(--color-grey-mid)" }}>
                        {a.codiceOs1 || (a.articoloId ? "" : "testo libero")}{a.ubicazione ? ` · ${a.ubicazione}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">{a.fornitore || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{a.totaleDaPreparare}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{a.giacenza ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {a.mancante === null ? "—" : manca ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold tabular-nums" style={{ background: "#FEE2E2", color: "#991B1B" }}>{a.mancante}</span>
                      ) : (
                        <span className="text-xs" style={{ color: "#166534" }}>coperto</span>
                      )}
                      {a.statoApprovvigionamento && (
                        <div className="mt-1">
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "#DBEAFE", color: "#1E40AF" }}>
                            {STATO_APPROVVIGIONAMENTO_LABEL[a.statoApprovvigionamento]}
                            {a.statoApprovvigionamento === "ordinato" && a.inArrivoIl ? ` — in arrivo al ${fmtData(a.inArrivoIl)}` : ""}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => toggle(a.chiave)} className="text-xs underline" style={{ color: "var(--color-primary)" }}>
                        {a.odp.length} ODP{aperto ? "▲" : "▼"}
                      </button>
                    </td>
                  </tr>
                  {aperto && (
                    <tr className="border-b" style={{ background: "#faf9f7" }}>
                      <td colSpan={6} className="px-4 py-2">
                        <ul className="space-y-1">
                          {a.odp.map(o => (
                            <li key={o.odpId} className="flex items-center gap-3 text-xs">
                              <Link href={`/ferramenta/fogli-scarico/${o.odpId}`} className="font-mono underline" style={{ color: "var(--color-primary)" }}>{o.odp}</Link>
                              <span className="flex-1">{o.numeroScheda} <span style={{ color: "var(--color-grey-mid)" }}>{o.clienteInfo}</span></span>
                              <span className="tabular-nums font-semibold">{o.residuo}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
