"use client";

import { useMemo, useState } from "react";
import type { AuditEntry } from "@/lib/audit";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function formatChangesInline(raw: string): string {
  try {
    const obj = JSON.parse(raw);
    return Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(" | ");
  } catch {
    return raw;
  }
}

// Pretty-print leggibile per il modal: JSON.stringify indentato se `raw` è JSON valido,
// altrimenti il testo grezzo così com'è (alcune voci più vecchie potrebbero non esserlo).
function formatChangesFull(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function azioneColori(azione: string): { background: string; color: string } {
  if (azione.startsWith("DELETE")) return { background: "#fee2e2", color: "#991b1b" };
  if (azione.startsWith("CREATE")) return { background: "#dcfce7", color: "#166534" };
  return { background: "#e0e7ff", color: "#3730a3" };
}

export default function AuditLogTable({ entries }: { entries: AuditEntry[] }) {
  const [selezionata, setSelezionata] = useState<AuditEntry | null>(null);
  const [search, setSearch] = useState("");

  const filtrate = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e =>
      e.operatore?.toLowerCase().includes(q)
      || e.azione?.toLowerCase().includes(q)
      || e.idRisorsa?.toLowerCase().includes(q)
      || e.modifiche?.toLowerCase().includes(q)
    );
  }, [entries, search]);

  return (
    <>
      <div className="mb-3">
        <input
          type="text"
          className="border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 w-full max-w-sm"
          placeholder="Cerca operatore, azione, ID risorsa, modifiche…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtrate.length === 0 ? (
        <div className="rounded-xl p-12 text-center" style={{ background: "white", border: "1px solid #e5e4e0" }}>
          <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
            Nessuna operazione corrisponde alla ricerca.
          </p>
        </div>
      ) : (
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e5e4e0" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#f8f7f5", borderBottom: "1px solid #e5e4e0" }}>
                <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", whiteSpace: "nowrap" }}>
                  Timestamp
                </th>
                <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>
                  Operatore
                </th>
                <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>
                  Azione
                </th>
                <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>
                  ID Risorsa
                </th>
                <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>
                  Modifiche
                </th>
              </tr>
            </thead>
            <tbody>
              {filtrate.map((entry, i) => {
                const colori = azioneColori(entry.azione);
                return (
                  <tr
                    key={entry.id}
                    onClick={() => setSelezionata(entry)}
                    className="cursor-pointer hover:bg-orange-50"
                    style={{
                      background: i % 2 === 0 ? "white" : "#fafaf9",
                      borderBottom: "1px solid #f0efed",
                    }}
                  >
                    <td className="px-4 py-3 tabular-nums" style={{ color: "var(--color-grey-mid)", whiteSpace: "nowrap" }}>
                      {formatDate(entry.timestamp)}
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: "var(--color-black)", whiteSpace: "nowrap" }}>
                      {entry.operatore || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium" style={colori}>
                        {entry.azione || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "#6b6966" }}>
                      {entry.idRisorsa ? (
                        <span title={entry.idRisorsa}>{entry.idRisorsa.slice(0, 8)}…</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 max-w-md">
                      <span className="text-xs" style={{ color: "var(--color-grey-mid)", wordBreak: "break-all" }}>
                        {entry.modifiche ? formatChangesInline(entry.modifiche) : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 text-xs" style={{ background: "#f8f7f5", color: "var(--color-grey-mid)", borderTop: "1px solid #e5e4e0" }}>
          {search ? `${filtrate.length} di ${entries.length} operazioni` : `${entries.length} operazioni — ultime 200`} · clicca una riga per vederla per esteso
        </div>
      </div>
      )}

      {selezionata && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setSelezionata(null)}
        >
          <div
            className="w-full max-w-2xl rounded-xl p-5 space-y-4"
            style={{ background: "white", maxHeight: "85vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold" style={{ color: "var(--color-black)" }}>
                  Dettaglio operazione
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
                  {formatDate(selezionata.timestamp)}
                </p>
              </div>
              <button
                onClick={() => setSelezionata(null)}
                className="text-gray-400 hover:text-gray-600 leading-none flex-shrink-0"
                style={{ fontSize: 22 }}
                aria-label="Chiudi"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>Operatore</p>
                <p className="text-sm font-medium mt-0.5" style={{ color: "var(--color-black)" }}>{selezionata.operatore || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>Azione</p>
                <span
                  className="inline-block mt-0.5 px-2 py-0.5 rounded text-xs font-medium"
                  style={azioneColori(selezionata.azione)}
                >
                  {selezionata.azione || "—"}
                </span>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>ID Risorsa</p>
              <p className="text-sm font-mono mt-0.5 break-all" style={{ color: "var(--color-black)" }}>{selezionata.idRisorsa || "—"}</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--color-grey-mid)" }}>Modifiche</p>
              <pre
                className="text-xs rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all"
                style={{ background: "#f8f7f5", color: "var(--color-black)", border: "1px solid #e5e4e0" }}
              >
                {selezionata.modifiche ? formatChangesFull(selezionata.modifiche) : "—"}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
