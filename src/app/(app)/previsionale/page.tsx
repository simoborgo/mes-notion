import { redirect } from "next/navigation";
import { getSession, PREVISIONALE_ROLES } from "@/lib/auth";
import { calcolaPrevisionale } from "@/lib/capacityPlannerRepository";
import { mesiOrizzonteDaOggi } from "@/lib/calendarioLavorativo";
import VistaPrevisionale from "@/components/VistaPrevisionale";

export const dynamic = "force-dynamic";

const N_MESI_DEFAULT = 12;

export default async function PrevisionalePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!PREVISIONALE_ROLES.includes(session.role)) redirect("/");

  const mesiOrizzonte = mesiOrizzonteDaOggi(N_MESI_DEFAULT);
  const risultato = await calcolaPrevisionale("tutte", mesiOrizzonte);

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Previsionale</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Capacity Planner — ore richieste dal portafoglio Offerte vs capacità per reparto
        </p>
      </div>
      <VistaPrevisionale risultatoIniziale={risultato} mesiOrizzonte={mesiOrizzonte} filtroIniziale="tutte" />
    </div>
  );
}
