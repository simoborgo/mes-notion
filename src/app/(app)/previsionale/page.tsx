import { redirect } from "next/navigation";
import { getSession, PREVISIONALE_ROLES } from "@/lib/auth";
import { calcolaPrevisionale } from "@/lib/capacityPlannerRepository";
import { mesiOrizzonteDaOggi } from "@/lib/calendarioLavorativo";
import { getParametriReparto } from "@/lib/parametriRepartoRepository";
import { getCostoOrarioManodopera } from "@/lib/parametriGeneraliRepository";
import { getTuttiOperatori } from "@/lib/notion";
import { getOfferte } from "@/lib/offerteRepository";
import PrevisionaleHub from "@/components/PrevisionaleHub";

export const dynamic = "force-dynamic";

const N_MESI_DEFAULT = 12;
const TAB_VALIDI = ["previsionale", "parametri", "offerte"] as const;

export default async function PrevisionalePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!PREVISIONALE_ROLES.includes(session.role)) redirect("/");

  const { tab } = await searchParams;
  const tabIniziale = TAB_VALIDI.includes(tab as typeof TAB_VALIDI[number]) ? (tab as typeof TAB_VALIDI[number]) : "previsionale";

  const mesiOrizzonte = mesiOrizzonteDaOggi(N_MESI_DEFAULT);
  const [risultato, parametriReparto, costoOrarioManodopera, operatori, offerte] = await Promise.all([
    calcolaPrevisionale("tutte", mesiOrizzonte),
    getParametriReparto(),
    getCostoOrarioManodopera(),
    getTuttiOperatori(),
    getOfferte(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Previsionale</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Capacity Planner — ore richieste dal portafoglio Offerte vs capacità per reparto
        </p>
      </div>
      <PrevisionaleHub
        risultatoIniziale={risultato}
        mesiOrizzonte={mesiOrizzonte}
        filtroIniziale="tutte"
        parametriReparto={parametriReparto}
        costoOrarioManodopera={costoOrarioManodopera}
        operatori={operatori}
        offerte={offerte}
        tabIniziale={tabIniziale}
      />
    </div>
  );
}
