import Link from "next/link";
import type { Area, Scheda } from "@/lib/types";
import BadgeStato from "./BadgeStato";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
}

// Tutte le schede ODP della commessa, con l'area di appartenenza; l'ODP apre la scheda a pagina piena.
export default function CommessaOdp({ schede, aree }: { schede: Scheda[]; aree: Area[] }) {
  if (schede.length === 0) return null;
  const nomeArea = new Map(aree.map((a) => [a.id, a.nomeArredo]));
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>Tutte le schede ({schede.length})</h2>
      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ background: "#faf9f7", color: "var(--color-grey-mid)" }}>
              <th className="px-4 py-2">ODP</th>
              <th className="px-4 py-2">N° Scheda</th>
              <th className="px-4 py-2">Area</th>
              <th className="px-4 py-2">Stato</th>
              <th className="px-4 py-2">Fase</th>
              <th className="px-4 py-2">Data Prod. Prev.</th>
            </tr>
          </thead>
          <tbody>
            {schede.map((s) => (
              <tr key={s.id} className="border-t" style={{ borderColor: "#e5e4e0" }}>
                <td className="px-4 py-2 tabular-nums font-medium">
                  <Link href={`/schede/${s.id}`} className="underline" style={{ color: "var(--color-primary)" }}>{s.odp || "—"}</Link>
                </td>
                <td className="px-4 py-2">{s.numeroScheda || "—"}</td>
                <td className="px-4 py-2 text-xs">{(s.areaId && nomeArea.get(s.areaId)) || "—"}</td>
                <td className="px-4 py-2">{s.statoProduzione ? <BadgeStato stato={s.statoProduzione} /> : "—"}</td>
                <td className="px-4 py-2">{s.faseCorrente ? <BadgeStato stato={s.faseCorrente} /> : "—"}</td>
                <td className="px-4 py-2 tabular-nums">{fmt(s.dataProduzionePrevista)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
