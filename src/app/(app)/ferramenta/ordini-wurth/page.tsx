import { redirect } from "next/navigation";
import { getSession, FERRAMENTA_ROLES } from "@/lib/auth";
import { getOrdiniWurth } from "@/lib/wurthOrdiniRepository";
import { getArticoloFerramentaById } from "@/lib/articoliFerramentaRepository";
import type { ArticoloFerramenta } from "@/lib/types";
import FerramentaSubNav from "@/components/FerramentaSubNav";
import TabellaOrdiniWurth from "@/components/TabellaOrdiniWurth";

export const dynamic = "force-dynamic";

export default async function OrdiniWurthPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!FERRAMENTA_ROLES.includes(session.role)) redirect("/");

  const ordini = await getOrdiniWurth();

  const articoloIds = new Set<string>();
  for (const o of ordini) {
    for (const r of o.righe) {
      if (r.articoloId) articoloIds.add(r.articoloId);
    }
  }
  const articoli: Record<string, ArticoloFerramenta> = {};
  for (const id of articoloIds) {
    try {
      articoli[id] = await getArticoloFerramentaById(id);
    } catch {
      // articolo cancellato dopo l'elaborazione dell'ordine: ignorato, la riga resta senza dettaglio prezzo di riferimento
    }
  }

  return (
    <div className="space-y-4">
      <FerramentaSubNav canManage={FERRAMENTA_ROLES.includes(session.role)} />
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Ordini Wurth
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Tracciati ricevuti da n8n — righe con prezzo da verificare o articolo non censito evidenziate
        </p>
      </div>
      <TabellaOrdiniWurth ordini={ordini} articoli={articoli} />
    </div>
  );
}
