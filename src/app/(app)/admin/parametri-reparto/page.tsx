import { redirect } from "next/navigation";
import { getSession, PARAMETRI_REPARTO_ROLES } from "@/lib/auth";
import { getParametriReparto } from "@/lib/parametriRepartoRepository";
import TabellaParametriReparto from "@/components/TabellaParametriReparto";

export const dynamic = "force-dynamic";

export default async function ParametriRepartoPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!PARAMETRI_REPARTO_ROLES.includes(session.role)) redirect("/");

  const parametri = await getParametriReparto();

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Parametri Reparto</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Capacità per reparto — base per il Previsionale (Capacity Planner)
        </p>
      </div>
      <TabellaParametriReparto parametriIniziali={parametri} />
    </div>
  );
}
