import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession, FERRAMENTA_ROLES } from "@/lib/auth";
import { getSchedaById } from "@/lib/schedeRepository";
import { getMovimentiByOdp } from "@/lib/ferramentaRepository";
import { getDistintaKitByOdp } from "@/lib/kitFerramentaRepository";
import { getArticoliFerramenta } from "@/lib/articoliFerramentaRepository";
import AggiungiArticoloKit from "@/components/AggiungiArticoloKit";

export const dynamic = "force-dynamic";

const TIPO_LABEL: Record<string, string> = {
  scarico_kanban: "Scarico (Kanban)",
  scarico_a_pezzo: "Scarico (A Pezzo)",
  carico: "Carico",
  rettifica: "Rettifica inventario",
};

const STATO_LABEL: Record<string, { text: string; bg: string; color: string }> = {
  completo: { text: "Scaricato", bg: "#F3F4F6", color: "#374151" },
  parziale: { text: "Parziale", bg: "#FEF3C7", color: "#92400E" },
  mancante: { text: "Da scaricare", bg: "#FEE2E2", color: "#991B1B" },
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

  const [distinta, movimenti, articoli] = await Promise.all([
    getDistintaKitByOdp(odpId),
    getMovimentiByOdp(odpId),
    getArticoliFerramenta(),
  ]);
  const articoliAPezzo = articoli.filter(a => a.attivo && a.metodoGestione === "A Pezzo");

  const scaricatoPerArticolo = new Map<string, number>();
  for (const m of movimenti) {
    if (m.tipo === "scarico_kanban" || m.tipo === "scarico_a_pezzo") {
      scaricatoPerArticolo.set(m.articoloId, (scaricatoPerArticolo.get(m.articoloId) ?? 0) + m.quantita);
    }
  }

  const righeDistinta = distinta.map(r => {
    const scaricato = scaricatoPerArticolo.get(r.articoloId) ?? 0;
    const stato = scaricato >= r.quantita ? "completo" : scaricato > 0 ? "parziale" : "mancante";
    return { ...r, scaricato, stato };
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Foglio di Scarico — {scheda.numeroScheda || scheda.odp}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          {scheda.odp} {scheda.clienteInfo ? `— ${scheda.clienteInfo}` : ""}
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--color-black)" }}>Distinta Kit Ferramenta</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
                <th className="px-4 py-3">Articolo</th>
                <th className="px-4 py-3">Pianificato</th>
                <th className="px-4 py-3">Scaricato</th>
                <th className="px-4 py-3">Stato</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {righeDistinta.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                    Nessuna riga in distinta per questo ODP
                  </td>
                </tr>
              ) : (
                righeDistinta.map(r => {
                  const s = STATO_LABEL[r.stato];
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">
                        {r.articoloDescrizione}
                        <div className="text-xs font-mono" style={{ color: "var(--color-grey-mid)" }}>{r.articoloCodiceOs1}</div>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{r.quantita}</td>
                      <td className="px-4 py-3 tabular-nums">{r.scaricato}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: s.bg, color: s.color }}>{s.text}</span>
                      </td>
                      <td className="px-4 py-3">
                        {r.stato !== "completo" && (
                          <Link
                            href={`/ferramenta/scarico/${r.articoloId}?odp=${odpId}&ritorno=${encodeURIComponent(`/ferramenta/fogli-scarico/${odpId}`)}`}
                            className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap border"
                            style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", borderColor: "rgba(240,143,37,0.3)" }}
                          >
                            Scarica
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <AggiungiArticoloKit odpId={odpId} articoliAPezzo={articoliAPezzo} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--color-black)" }}>Storico movimenti</h2>
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
    </div>
  );
}
