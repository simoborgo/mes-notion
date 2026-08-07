import { redirect } from "next/navigation";
import { getSession, PARAMETRI_REPARTO_ROLES } from "@/lib/auth";
import { getParametriReparto } from "@/lib/parametriRepartoRepository";
import { getCostoOrarioManodopera } from "@/lib/parametriGeneraliRepository";
import TabellaParametriReparto from "@/components/TabellaParametriReparto";
import CostoManodoperaForm from "@/components/CostoManodoperaForm";

export const dynamic = "force-dynamic";

export default async function ParametriRepartoPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!PARAMETRI_REPARTO_ROLES.includes(session.role)) redirect("/");

  const [parametri, costoOrarioManodopera] = await Promise.all([
    getParametriReparto(),
    getCostoOrarioManodopera(),
  ]);

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Parametri Reparto</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Capacità per reparto — base per il Previsionale (Capacity Planner)
        </p>
      </div>
      <CostoManodoperaForm costoIniziale={costoOrarioManodopera} />
      <TabellaParametriReparto parametriIniziali={parametri} />
    </div>
  );
}
