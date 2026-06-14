"use client";

import { useEffect, useRef, useState } from "react";
import type { Commessa, Area, Scheda } from "@/lib/types";
import BadgeStato from "./BadgeStato";

interface Props {
  commessaId: string | null;
  onClose: () => void;
}

interface DettaglioData {
  commessa: Commessa;
  aree: Area[];
  schede: Scheda[];
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

function InfoGrid({ commessa }: { commessa: Commessa }) {
  const items = [
    { label: "Responsabile", value: commessa.responsabile || "—" },
    { label: "Data Carico", value: fmt(commessa.dataCarico) },
    { label: "Inizio Montaggio", value: fmt(commessa.inizioMontaggio) },
    { label: "Fine Montaggio", value: fmt(commessa.fineMontaggio) },
    { label: "Giorni Montaggio", value: commessa.giorniMontaggio != null ? String(commessa.giorniMontaggio) : "—" },
    { label: "Località", value: commessa.localita || "—" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map(({ label, value }) => (
        <div key={label} className="rounded-md px-3 py-2" style={{ background: "#faf9f7", border: "1px solid #e5e4e0" }}>
          <div className="text-xs font-medium mb-0.5" style={{ color: "var(--color-grey-mid)" }}>{label}</div>
          <div className="text-sm font-medium" style={{ color: "var(--color-black)" }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function AreaAccordion({ area, schede }: { area: Area; schede: Scheda[] }) {
  const [open, setOpen] = useState(false); // chiuso di default
  const schedeArea = schede.filter((s) => s.areaId === area.id);
  const pct = area.completamento ?? 0;

  return (
    <div className="rounded-md border" style={{ borderColor: "#e5e4e0" }}>
      <button
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
        onClick={() => setOpen((p) => !p)}
      >
        <span
          className="text-xs transition-transform"
          style={{ color: "var(--color-grey-icon)", transform: open ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}
        >
          ▶
        </span>
        <span className="flex-1 text-sm font-medium truncate" style={{ color: "var(--color-black)" }}>
          {area.nomeArredo || "—"}
        </span>
        {area.statoProduzione && <BadgeStato stato={area.statoProduzione} />}
        <span className="text-xs tabular-nums ml-1" style={{ color: "var(--color-grey-mid)" }}>
          {pct}%
        </span>
        {schedeArea.length > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(240,143,37,0.12)", color: "var(--color-primary)" }}>
            {schedeArea.length} schede
          </span>
        )}
      </button>

      <div className="px-3 pb-1">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#e5e4e0" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: "var(--color-primary)" }}
          />
        </div>
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-1.5">
          {area.dataConsegnaPrevista && (
            <div className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
              Consegna prevista: <span style={{ color: "var(--color-black)" }}>{fmt(area.dataConsegnaPrevista)}</span>
            </div>
          )}
          {area.note && (
            <div className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
              Note: <span style={{ color: "var(--color-black)" }}>{area.note}</span>
            </div>
          )}
          {schedeArea.length > 0 ? (
            <table className="w-full text-xs mt-2">
              <thead>
                <tr style={{ color: "var(--color-grey-mid)" }}>
                  <th className="text-left pb-1 font-medium">ODP</th>
                  <th className="text-left pb-1 font-medium">N° Scheda</th>
                  <th className="text-left pb-1 font-medium">Stato</th>
                  <th className="text-left pb-1 font-medium">Data Prod.</th>
                </tr>
              </thead>
              <tbody>
                {schedeArea.map((s) => (
                  <tr key={s.id} className="border-t" style={{ borderColor: "#e5e4e0" }}>
                    <td className="py-1 tabular-nums">{s.odp || "—"}</td>
                    <td className="py-1">{s.numeroScheda || "—"}</td>
                    <td className="py-1">{s.statoProduzione ? <BadgeStato stato={s.statoProduzione} /> : "—"}</td>
                    <td className="py-1 tabular-nums">{fmt(s.dataProduzionePrevista)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-xs mt-1" style={{ color: "var(--color-grey-mid)" }}>Nessuna scheda collegata</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DettaglioCommessaModal({ commessaId, onClose }: Props) {
  const [data, setData] = useState<DettaglioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!commessaId) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/commesse/${commessaId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Non trovato");
        return r.json();
      })
      .then(setData)
      .catch(() => setError("Impossibile caricare i dati"))
      .finally(() => setLoading(false));
  }, [commessaId]);

  useEffect(() => {
    if (!commessaId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commessaId, onClose]);

  if (!commessaId) return null;

  const schede20 = data ? data.schede : [];

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(26,23,20,0.55)" }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="relative w-full max-w-4xl rounded-xl shadow-2xl flex flex-col"
        style={{ maxHeight: "90vh", background: "white" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: "#e5e4e0" }}>
          {data ? (
            <>
              <span className="text-lg font-bold" style={{ color: "var(--color-black)" }}>
                #{data.commessa.numeroCommessa}
              </span>
              <span className="text-base font-medium flex-1 truncate" style={{ color: "var(--color-black)" }}>
                {data.commessa.cliente}
              </span>
              <BadgeStato stato={data.commessa.stato} />
              <a
                href={data.commessa.notionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-2.5 py-1 rounded font-medium"
                style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.10)" }}
              >
                Apri in Notion ↗
              </a>
            </>
          ) : (
            <span className="flex-1 text-base font-medium" style={{ color: "var(--color-grey-mid)" }}>Dettaglio commessa</span>
          )}
          <button
            onClick={onClose}
            className="ml-2 w-7 h-7 flex items-center justify-center rounded-full text-sm transition-colors hover:bg-gray-100"
            style={{ color: "var(--color-grey-icon)" }}
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        {/* Body scrollabile */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div
                className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }}
              />
            </div>
          )}

          {error && (
            <div className="py-8 text-center text-sm" style={{ color: "#991B1B" }}>{error}</div>
          )}

          {data && (
            <>
              {/* Grid info */}
              <section>
                <InfoGrid commessa={data.commessa} />
              </section>

              {/* Tutte le schede */}
              {data.schede.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--color-grey-mid)" }}>
                    Tutte le schede ({data.schede.length})
                  </h3>
                  <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "#e5e4e0" }}>
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr style={{ background: "#faf9f7", color: "var(--color-grey-mid)" }}>
                          <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">ODP</th>
                          <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">N° Scheda</th>
                          <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Stato</th>
                          <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Data Prod. Prev.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schede20.map((s) => (
                          <tr key={s.id} className="border-t" style={{ borderColor: "#e5e4e0" }}>
                            <td className="px-3 py-2 tabular-nums font-medium">{s.odp || "—"}</td>
                            <td className="px-3 py-2">{s.numeroScheda || "—"}</td>
                            <td className="px-3 py-2">{s.statoProduzione ? <BadgeStato stato={s.statoProduzione} /> : "—"}</td>
                            <td className="px-3 py-2 tabular-nums">{fmt(s.dataProduzionePrevista)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Aree */}
              {data.aree.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--color-grey-mid)" }}>
                    Aree / Cartelle ({data.aree.length})
                  </h3>
                  <div className="space-y-2">
                    {data.aree.map((a) => (
                      <AreaAccordion key={a.id} area={a} schede={data.schede} />
                    ))}
                  </div>
                </section>
              )}

              {data.aree.length === 0 && data.schede.length === 0 && (
                <div className="py-6 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Nessuna area o scheda collegata
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
