import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { REPARTI_ROLES } from "@/lib/roles";
import { getPatternCiclo } from "@/lib/patternCicloRepository";
import TabellaPatternCiclo from "@/components/TabellaPatternCiclo";

export const dynamic = "force-dynamic";

export default async function PatternCicloPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!REPARTI_ROLES.includes(session.role)) redirect("/");

  const pattern = await getPatternCiclo();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Pattern Ciclo (APS)</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Sequenze di reparti/sotto-fasi che un articolo attraversa — assegnate poi per
          articolo in Articoli (APS). Un pattern disattivato non è più selezionabile per nuove
          fasi, ma resta consultabile qui.
        </p>
      </div>
      <TabellaPatternCiclo patternIniziali={pattern} />
    </div>
  );
}
