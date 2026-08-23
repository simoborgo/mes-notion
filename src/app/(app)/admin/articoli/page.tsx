import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { REPARTI_ROLES } from "@/lib/roles";
import { getArticoliConPattern } from "@/lib/articoliRepository";
import { getPatternCicloAttivi } from "@/lib/patternCicloRepository";
import TabellaArticoli from "@/components/TabellaArticoli";

export const dynamic = "force-dynamic";

export default async function ArticoliPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!REPARTI_ROLES.includes(session.role)) redirect("/");

  const [articoli, pattern] = await Promise.all([getArticoliConPattern(), getPatternCicloAttivi()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Articoli (APS)</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Assegnazione del Pattern di Ciclo per articolo — determina quali fasi/reparti
          attraversa un ODP quando viene generato il piano APS.
        </p>
      </div>
      <TabellaArticoli articoliIniziali={articoli} pattern={pattern} />
    </div>
  );
}
