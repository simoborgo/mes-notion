"use client";

import { useMemo, useState } from "react";
import type { Commessa, Scheda } from "@/lib/types";
import { STATI_CHIUSI_ODP } from "@/lib/types";
import type { Role } from "@/lib/roles";
import BadgeStato from "./BadgeStato";
import DettaglioSchedaModal from "./DettaglioSchedaModal";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

export interface OdpInPiuCarichi {
  schedaId: string;
  carichi: { id: string; titolo: string; dataCarico: string | null }[];
}

interface Props {
  schede: Scheda[];
  commesse: Commessa[];
  schedeInCarico: string[];
  inPiuCarichi: OdpInPiuCarichi[];
  userRole?: Role;
}

function TabellaOdp({ odp, onSelect }: { odp: Scheda[]; onSelect: (s: Scheda) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
            <th className="px-4 py-3">ODP</th>
            <th className="px-4 py-3">Cliente / Descrizione</th>
            <th className="px-4 py-3">Articolo</th>
            <th className="px-4 py-3 text-right">Q.tà</th>
            <th className="px-4 py-3">Stato</th>
            <th className="px-4 py-3">Prod. prevista</th>
          </tr>
        </thead>
        <tbody>
          {odp.map((s) => (
            <tr key={s.id} onClick={() => onSelect(s)} className="border-b last:border-0 hover:bg-orange-50/30 cursor-pointer transition-colors">
              <td className="px-4 py-2 font-medium whitespace-nowrap">{s.odp}{s.numeroScheda ? ` - ${s.numeroScheda}` : ""}</td>
              <td className="px-4 py-2">{s.clienteInfo || s.descrizioneFasi || "—"}</td>
              <td className="px-4 py-2">{[s.codiceArticolo, s.posizione].filter(Boolean).join(" · ") || "—"}</td>
              <td className="px-4 py-2 text-right tabular-nums">{s.quantita ?? "—"}</td>
              <td className="px-4 py-2">{s.statoProduzione ? <BadgeStato stato={s.statoProduzione} /> : "—"}</td>
              <td className="px-4 py-2 tabular-nums whitespace-nowrap">{fmt(s.dataProduzionePrevista)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OdpSenzaCarico({ schede: initial, commesse, schedeInCarico, inPiuCarichi, userRole }: Props) {
  const [schede, setSchede] = useState(initial);
  const [nascondiChiuse, setNascondiChiuse] = useState(true);
  const [viewing, setViewing] = useState<Scheda | null>(null);

  const commesseChiuseNr = useMemo(() => new Set(commesse.filter((c) => c.stato === "Chiusa").map((c) => c.numeroCommessa)), [commesse]);
  const inCarico = useMemo(() => new Set(schedeInCarico), [schedeInCarico]);

  const gruppi = useMemo(() => {
    const senza = schede.filter(
      (s) => !STATI_CHIUSI_ODP.includes(s.statoProduzione) && !inCarico.has(s.id) && !(nascondiChiuse && commesseChiuseNr.has(s.commessaNr)),
    );
    const byCommessa = new Map<string, Scheda[]>();
    for (const s of senza) {
      const k = s.commessaNr || "";
      const arr = byCommessa.get(k) ?? [];
      arr.push(s);
      byCommessa.set(k, arr);
    }
    return [...byCommessa.entries()]
      .map(([nr, odp]) => ({
        nr,
        label: nr ? `${nr}${odp[0].clienteInfo ? " — " + odp[0].clienteInfo.replace(/^\d+\s*/, "").trim() : ""}` : "Senza commessa",
        odp: odp.sort((a, b) => a.odp.localeCompare(b.odp, "it", { numeric: true })),
      }))
      .sort((a, b) => (a.nr === "" ? 1 : b.nr === "" ? -1 : b.nr.localeCompare(a.nr, "it", { numeric: true })));
  }, [schede, inCarico, nascondiChiuse, commesseChiuseNr]);

  const totale = gruppi.reduce((n, g) => n + g.odp.length, 0);
  const schedaMap = useMemo(() => new Map(schede.map((s) => [s.id, s])), [schede]);
  const doppioni = inPiuCarichi.filter((d) => schedaMap.has(d.schedaId));

  return (
    <div className="space-y-6">
      {doppioni.length > 0 && (
        <section className="rounded-lg border p-4 space-y-2" style={{ borderColor: "#FCA5A5", background: "#FEF2F2" }}>
          <h2 className="text-base font-semibold" style={{ color: "#991B1B" }}>ODP in più carichi ({doppioni.length})</h2>
          <p className="text-sm" style={{ color: "#991B1B" }}>Un ODP deve stare in un solo carico: togli l&apos;ODP da uno dei carichi indicati.</p>
          <ul className="text-sm space-y-1">
            {doppioni.map((d) => {
              const s = schedaMap.get(d.schedaId)!;
              return (
                <li key={d.schedaId}>
                  <button type="button" className="font-semibold hover:underline" onClick={() => setViewing(s)}>{s.odp}</button>
                  <span className="ml-2" style={{ color: "var(--color-grey-mid)" }}>
                    {d.carichi.map((c) => `«${c.titolo}»${c.dataCarico ? ` ${fmt(c.dataCarico)}` : ""}`).join(" · ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm" style={{ color: "var(--color-black)" }}>
          <input
            type="checkbox"
            checked={nascondiChiuse}
            onChange={(e) => setNascondiChiuse(e.target.checked)}
            className="w-4 h-4 cursor-pointer accent-orange-500"
          />
          Nascondi commesse chiuse
        </label>
        <span className="text-sm font-medium" style={{ color: "var(--color-grey-mid)" }}>{totale} ODP senza carico</span>
      </div>

      {gruppi.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>Tutti gli ODP attivi hanno un carico</p>
      ) : (
        gruppi.map((g) => (
          <section key={g.nr || "senza-commessa"} className="space-y-2">
            <div className="flex items-center gap-2 pb-1 border-b" style={{ borderColor: "#E4E0DA" }}>
              <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>{g.label}</h2>
              <span className="text-sm" style={{ color: "var(--color-grey-mid)" }}>{g.odp.length} ODP</span>
            </div>
            <TabellaOdp odp={g.odp} onSelect={setViewing} />
          </section>
        ))
      )}

      {viewing && (
        <DettaglioSchedaModal
          scheda={viewing}
          onClose={() => setViewing(null)}
          userRole={userRole}
          onSchedaAggiornata={(u) => { setSchede((prev) => prev.map((s) => (s.id === u.id ? u : s))); setViewing(u); }}
        />
      )}
    </div>
  );
}
