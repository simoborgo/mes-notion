import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, FERRAMENTA_ROLES } from "@/lib/auth";
import { getInventariChiusi, getRigheByInventario } from "@/lib/inventarioFerramentaRepository";

export const dynamic = "force-dynamic";

const AMBITO_LABEL: Record<string, string> = {
  tutto: "Tutto il catalogo",
  kanban: "Solo Kanban",
  ubicazione: "Ubicazione",
  sotto_scorta: "Sotto scorta",
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function StoricoInventarioPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!FERRAMENTA_ROLES.includes(session.role)) redirect("/");

  const sessioni = await getInventariChiusi();
  const righeCounts = await Promise.all(sessioni.map(async s => {
    const righe = await getRigheByInventario(s.id);
    const scostamenti = righe.filter(r => r.scostamento != null && r.scostamento !== 0).length;
    return { articoli: righe.length, scostamenti };
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Storico Inventari
        </h1>
        <Link href="/ferramenta/inventario" className="text-xs underline" style={{ color: "var(--color-primary)" }}>
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
              <th className="px-4 py-3">Articoli</th>
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
                  <td className="px-4 py-3">{AMBITO_LABEL[s.ambito]}{s.ambitoValore ? `: ${s.ambitoValore}` : ""}</td>
                  <td className="px-4 py-3">{s.chiusoDa || s.apertoDa}</td>
                  <td className="px-4 py-3 tabular-nums">{righeCounts[i].articoli}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {righeCounts[i].scostamenti > 0 ? (
                      <span className="font-semibold" style={{ color: "#991B1B" }}>{righeCounts[i].scostamenti}</span>
                    ) : "0"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/ferramenta/inventario/${s.id}`}
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
