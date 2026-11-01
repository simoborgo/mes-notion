import Link from "next/link";
import type { Commessa, Scheda, Carico } from "@/lib/types";
import type { RiepilogoCommessa } from "@/lib/commesseRepository";
import BadgeStato from "./BadgeStato";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
}

function coloreAvanzamento(pct: number): string {
  if (pct <= 20) return "#EF4444";
  if (pct <= 40) return "#F97316";
  if (pct <= 60) return "#F59E0B";
  if (pct <= 80) return "#84CC16";
  if (pct <= 90) return "#22C55E";
  return "#16A34A";
}

export default function CommessaPanoramica({ commessa, schede, carichi, riepilogo }: {
  commessa: Commessa; schede: Scheda[]; carichi: Carico[]; riepilogo: RiepilogoCommessa;
}) {
  const completati = schede.filter((s) => s.statoProduzione === "Completato").length;
  const inLavorazione = schede.filter((s) => !["Completato", "Annullata", "Da Iniziare"].includes(s.statoProduzione ?? "")).length;
  const pct = schede.length ? Math.round((completati / schede.length) * 100) : 0;
  const perId = new Map(schede.map((s) => [s.id, s]));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 rounded-lg border border-gray-200 bg-white p-4">
        {[
          { label: "Responsabile", value: commessa.responsabile || "—" },
          { label: "Località", value: commessa.localita || "—" },
          { label: "Inizio Produzione", value: fmt(commessa.inizioProduzione) },
          { label: "Fine Produzione", value: fmt(commessa.fineProduzione) },
          { label: "Prossimo Carico", value: fmt(commessa.dataCarico) },
          { label: "Inizio Montaggio", value: fmt(commessa.inizioMontaggio) },
          { label: "Fine Montaggio", value: fmt(commessa.fineMontaggio) },
          { label: "Giorni Montaggio", value: commessa.giorniMontaggio != null ? String(commessa.giorniMontaggio) : "—" },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs mb-0.5" style={{ color: "var(--color-grey-mid)" }}>{label}</p>
            <p className="text-sm font-medium">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { n: riepilogo.odp, label: `ODP (${riepilogo.odpCompletati} completati)` },
          { n: riepilogo.carichi, label: "Carichi" },
          { n: riepilogo.casse, label: `Casse (${riepilogo.casseCaricate} caricate)` },
          { n: riepilogo.campionature, label: "Campionature" },
        ].map(({ n, label }) => (
          <div key={label} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-xl font-semibold tabular-nums">{n}</p>
            <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{label}</p>
          </div>
        ))}
      </div>

      {schede.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>Avanzamento ODP</span>
            <div className="flex items-center gap-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>
              <span><span className="font-semibold tabular-nums" style={{ color: "var(--color-black)" }}>{inLavorazione}</span> in lavorazione</span>
              <span><span className="font-semibold tabular-nums" style={{ color: "var(--color-black)" }}>{completati}</span>/{schede.length} completati</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: coloreAvanzamento(pct) }}>{pct}%</span>
            </div>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "#e5e4e0" }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: coloreAvanzamento(pct) }} />
          </div>
        </div>
      )}

      {carichi.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>Carichi previsti ({carichi.length})</h2>
          {carichi
            .slice()
            .sort((a, b) => ((a.dataCarico ?? "") < (b.dataCarico ?? "") ? -1 : 1))
            .map((c) => {
              const odps = c.odpIds.map((id) => perId.get(id)).filter(Boolean) as Scheda[];
              return (
                <div key={c.id} className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{c.titolo || "—"}</span>
                    {c.modalita && <BadgeStato stato={c.modalita} />}
                    {c.stato && <BadgeStato stato={c.stato} />}
                    <span className="ml-auto text-xs tabular-nums font-medium" style={{ color: "var(--color-grey-mid)" }}>{fmt(c.dataCarico)}</span>
                  </div>
                  {odps.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {odps.map((s) => (
                        <Link key={s.id} href={`/schede/${s.id}`} className="text-xs rounded border px-2 py-0.5 hover:underline tabular-nums" style={{ borderColor: "#E4E0DA", background: "#faf9f7" }}>
                          {s.odp || s.numeroScheda}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Nessuna scheda ODP collegata</p>
                  )}
                </div>
              );
            })}
        </section>
      )}
    </div>
  );
}
