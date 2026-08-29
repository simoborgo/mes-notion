"use client";

import { useEffect, useState } from "react";

interface RigaStorico {
  modificatoIl: string;
  operatore: string;
  nPersone: number;
  oreGiorno: number;
  pctStraordinariMax: number;
  margineSicurezzaEsterni: number;
  tariffaEsternaEurH: number | null;
  oreGiornoEsterno: number | null;
}

function fmt(d: string) {
  return new Date(d).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function StoricoParametriRepartoModal({ reparto, onClose }: { reparto: string; onClose: () => void }) {
  const [righe, setRighe] = useState<RigaStorico[] | null>(null);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    fetch(`/api/admin/parametri-reparto/storico?reparto=${encodeURIComponent(reparto)}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setRighe(data);
        else setErrore(data?.error ?? "Errore caricamento storico");
      })
      .catch(() => setErrore("Errore caricamento storico"));
  }, [reparto]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[85vh]" style={{ borderRadius: "var(--radius-modal)" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-start justify-between" style={{ background: "#faf9f7" }}>
          <div>
            <h2 className="font-semibold text-base">Storico Parametri — {reparto}</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
              Ricostruito dal log modifiche — solo i valori di organico/parametri nel tempo, non un ricalcolo storico del Previsionale.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5">
          {errore && <p className="text-sm" style={{ color: "#991B1B" }}>{errore}</p>}
          {!errore && righe == null && <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</p>}
          {!errore && righe != null && righe.length === 0 && (
            <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
              Nessuna modifica registrata per questo reparto — i valori attuali sono quelli di sempre (nessuna storia da mostrare).
            </p>
          )}
          {!errore && righe != null && righe.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
                    <th className="px-3 py-2 whitespace-nowrap">Data modifica</th>
                    <th className="px-3 py-2 whitespace-nowrap">Operatore</th>
                    <th className="px-3 py-2 whitespace-nowrap">N. persone</th>
                    <th className="px-3 py-2 whitespace-nowrap">Ore/giorno</th>
                    <th className="px-3 py-2 whitespace-nowrap">% Straord.</th>
                    <th className="px-3 py-2 whitespace-nowrap">Margine est. %</th>
                    <th className="px-3 py-2 whitespace-nowrap">Tariffa est. €/h</th>
                    <th className="px-3 py-2 whitespace-nowrap">Ore/giorno est.</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap font-medium">{fmt(r.modificatoIl)}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--color-grey-mid)" }}>{r.operatore}</td>
                      <td className="px-3 py-2 tabular-nums">{r.nPersone}</td>
                      <td className="px-3 py-2 tabular-nums">{r.oreGiorno}</td>
                      <td className="px-3 py-2 tabular-nums">{r.pctStraordinariMax}%</td>
                      <td className="px-3 py-2 tabular-nums">{r.margineSicurezzaEsterni}%</td>
                      <td className="px-3 py-2 tabular-nums">{r.tariffaEsternaEurH ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{r.oreGiornoEsterno ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
