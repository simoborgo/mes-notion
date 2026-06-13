import { getCommesse } from "@/lib/notion";
import Link from "next/link";
import BadgeStato from "@/components/BadgeStato";

export const revalidate = 60;

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

export default async function CommessePage() {
  const commesse = await getCommesse();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Commesse
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          {commesse.length} commesse totali
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <th className="px-4 py-3">N° Commessa</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Località</th>
              <th className="px-4 py-3">Stato</th>
              <th className="px-4 py-3">Inizio Mont.</th>
              <th className="px-4 py-3">Fine Mont.</th>
              <th className="px-4 py-3">Giorni</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {commesse.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Nessuna commessa trovata
                </td>
              </tr>
            ) : (
              commesse.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-orange-50/30 transition-colors">
                  <td className="px-4 py-3 font-semibold">{c.numeroCommessa || "—"}</td>
                  <td className="px-4 py-3">{c.cliente || "—"}</td>
                  <td className="px-4 py-3 text-xs">{c.localita || "—"}</td>
                  <td className="px-4 py-3"><BadgeStato stato={c.stato} /></td>
                  <td className="px-4 py-3 tabular-nums">{fmt(c.inizioMontaggio)}</td>
                  <td className="px-4 py-3 tabular-nums">{fmt(c.fineMontaggio)}</td>
                  <td className="px-4 py-3 tabular-nums">{c.giorniMontaggio ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/commesse/${c.id}`}
                      className="text-xs px-2 py-1 rounded font-medium transition-colors"
                      style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)" }}
                    >
                      Dettaglio
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
