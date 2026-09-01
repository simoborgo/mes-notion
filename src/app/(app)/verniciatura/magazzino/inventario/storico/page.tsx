import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { getInventariChiusi, getRigheByInventario, AMBITO_VERNICI_LABEL } from "@/lib/inventarioMagazzinoRepository";

export const dynamic = "force-dynamic";

function fmt(d: string) {
  return new Date(d).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function StoricoInventarioVerniciPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!MAGAZZINO_VERNICI_ROLES.includes(session.role)) redirect("/");

  const sessioni = await getInventariChiusi("vernici");
  const righeCounts = await Promise.all(sessioni.map(async s => {
    const righe = await getRigheByInventario(s.id);
    const scostamenti = righe.filter(r => r.scostamento != null && r.scostamento !== 0).length;
    return { vernici: righe.length, scostamenti };
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Storico Inventari Vernici
        </h1>
        <Link href="/verniciatura/magazzino/inventario" className="text-xs underline" style={{ color: "var(--color-primary)" }}>
          ← Torna a Inventario
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Ambito</th>
              <th className="px-4 py-3">Operatore</th>
              <th className="px-4 py-3">Vernici</th>
              <th className="px-4 py-3">Scostamenti</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {sessioni.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Nessun inventario chiuso
                </td>
              </tr>
            ) : (
              sessioni.map((s, i) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap">{s.chiusoIl ? fmt(s.chiusoIl) : "—"}</td>
                  <td className="px-4 py-3">{AMBITO_VERNICI_LABEL[s.ambito]}{s.ambitoValore ? `: ${s.ambitoValore}` : ""}</td>
                  <td className="px-4 py-3">{s.chiusoDa || s.apertoDa}</td>
                  <td className="px-4 py-3 tabular-nums">{righeCounts[i].vernici}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {righeCounts[i].scostamenti > 0 ? (
                      <span className="font-semibold" style={{ color: "#991B1B" }}>{righeCounts[i].scostamenti}</span>
                    ) : "0"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/verniciatura/magazzino/inventario/${s.id}`}
                      className="text-xs px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap border"
                      style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", borderColor: "rgba(240,143,37,0.3)" }}
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
