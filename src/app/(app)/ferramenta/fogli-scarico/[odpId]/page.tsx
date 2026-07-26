import { notFound, redirect } from "next/navigation";
import { getSession, FERRAMENTA_ROLES } from "@/lib/auth";
import { getSchedaById } from "@/lib/notion";
import { getMovimentiByOdp } from "@/lib/ferramentaRepository";

export const dynamic = "force-dynamic";

const TIPO_LABEL: Record<string, string> = {
  scarico_kanban: "Scarico (Kanban)",
  scarico_a_pezzo: "Scarico (A Pezzo)",
  carico: "Carico",
  rettifica: "Rettifica inventario",
};

function fmt(d: string) {
  return new Date(d).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function FoglioScaricoDettaglioPage({ params }: { params: Promise<{ odpId: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!FERRAMENTA_ROLES.includes(session.role)) redirect("/");

  const { odpId } = await params;
  let scheda;
  try {
    scheda = await getSchedaById(odpId);
  } catch {
    notFound();
  }
  if (!scheda) notFound();

  const movimenti = await getMovimentiByOdp(odpId);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Foglio di Scarico — {scheda.numeroScheda || scheda.odp}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          {scheda.odp} {scheda.clienteInfo ? `— ${scheda.clienteInfo}` : ""}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Articolo</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Quantità</th>
              <th className="px-4 py-3">Operatore</th>
            </tr>
          </thead>
          <tbody>
            {movimenti.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Nessun movimento registrato per questo ODP
                </td>
              </tr>
            ) : (
              movimenti.map(m => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap">{fmt(m.creatoIl)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{m.codiceOs1 || "—"}</td>
                  <td className="px-4 py-3">{TIPO_LABEL[m.tipo] ?? m.tipo}</td>
                  <td className="px-4 py-3 tabular-nums">{m.quantita}</td>
                  <td className="px-4 py-3">{m.operatore}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
