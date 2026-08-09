import { redirect } from "next/navigation";
import { getSession, VERNICIATURA_ROLES } from "@/lib/auth";
import { getLaboratori } from "@/lib/laboratoriRepository";
import VerniciaturaSubNav from "@/components/VerniciaturaSubNav";
import TabellaLaboratori from "@/components/TabellaLaboratori";

export const dynamic = "force-dynamic";

export default async function LaboratoriPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!VERNICIATURA_ROLES.includes(session.role)) redirect("/");

  const laboratori = await getLaboratori(false);

  return (
    <div className="space-y-4">
      <VerniciaturaSubNav />
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Fornitori e Laboratori</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Registro condiviso: la stessa voce può essere usata sia come fornitore vernice sia come laboratorio tintometrico.
        </p>
      </div>
      <TabellaLaboratori laboratori={laboratori} />
    </div>
  );
}
