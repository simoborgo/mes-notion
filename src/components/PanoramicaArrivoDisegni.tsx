"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ArrivoCommessa } from "@/lib/arrivoDisegniCalc";
import { costruisciVista, type DatiCommessaArrivo } from "@/lib/arrivoDisegniVista";
import GraficoArrivoDisegni from "./GraficoArrivoDisegni";
import BadgeStato from "./BadgeStato";

const BORDO = "#E4E0DA";

type Ordine = "numero" | "inizio" | "disegni";

function fmtCorta(d: string | null): string {
  if (!d) return "—";
  const [, m, g] = d.split("-");
  return `${g}/${m}`;
}

// Una scheda per commessa, tutte sulla stessa scala dei disegni arrivati: si confronta a colpo
// d'occhio dove si concentrano gli arrivi. Click sulla scheda → dettaglio della commessa.
export default function PanoramicaArrivoDisegni({
  commesse, arrivi, oggi,
}: { commesse: DatiCommessaArrivo[]; arrivi: Record<string, ArrivoCommessa>; oggi: string }) {
  const [ordine, setOrdine] = useState<Ordine>("inizio");

  const schede = useMemo(() => {
    const list = commesse.map(c => {
      const arrivo = arrivi[c.id];
      return { c, arrivo, vista: costruisciVista(c, arrivo, oggi, "settimana") };
    });
    const chiave = (x: (typeof list)[number]): string | number => {
      if (ordine === "numero") return x.c.numeroCommessa;
      if (ordine === "disegni") return -(x.vista?.riepilogo.conData ?? 0);
      return x.c.inizioProduzione ?? "9999-12-31"; // senza inizio in fondo
    };
    return [...list].sort((a, b) => (chiave(a) < chiave(b) ? -1 : chiave(a) > chiave(b) ? 1 : 0));
  }, [commesse, arrivi, oggi, ordine]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Ordina per:</span>
        {([["inizio", "Inizio produzione"], ["numero", "N° commessa"], ["disegni", "N° disegni"]] as const).map(([v, label]) => {
          const active = ordine === v;
          return (
            <button key={v} onClick={() => setOrdine(v)}
              className="text-xs px-2.5 py-1 rounded-full font-medium border transition-colors"
              style={active
                ? { background: "rgba(240,143,37,0.12)", color: "var(--color-primary)", borderColor: "rgba(240,143,37,0.35)" }
                : { background: "white", color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}>
              {label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {schede.map(({ c, arrivo, vista }) => (
          <Link key={c.id} href={`/commesse/${c.id}/disegni`}
            className="rounded-xl border bg-white p-4 block transition-shadow hover:shadow-md" style={{ borderColor: BORDO }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold text-[15px]">{c.numeroCommessa}</div>
                <div className="text-sm truncate" style={{ color: "#374151" }}>{c.cliente || "—"}</div>
              </div>
              <BadgeStato stato={c.stato} />
            </div>

            <div className="mt-2">
              {vista
                ? <GraficoArrivoDisegni buckets={vista.buckets} granularita="settimana" compatto
                    marcatori={{ inizio: c.inizioProduzione, fine: vista.fine, oggi }} />
                : <div className="text-xs py-8 text-center" style={{ color: "var(--color-grey-mid)" }}>Nessun disegno con data di arrivo</div>}
            </div>

            <div className="flex justify-between gap-2 text-[11px] mt-2 tabular-nums" style={{ color: "var(--color-grey-mid)" }}>
              <span>
                {vista ? `${vista.riepilogo.conData} disegni` : `${arrivo.totale} schede`}
                {arrivo.senzaData > 0 && ` (+${arrivo.senzaData} senza data)`}
              </span>
              <span>
                Produzione {fmtCorta(c.inizioProduzione)} → {fmtCorta(c.fineProduzione)}
              </span>
            </div>
            {vista && vista.riepilogo.giorni50 != null && (
              <div className="text-[11px] mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
                50% in {vista.riepilogo.giorni50} gg · 80% in {vista.riepilogo.giorni80} gg dall&apos;inizio
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
