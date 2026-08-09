import { redirect } from "next/navigation";
import { getSession, VERNICIATURA_ROLES } from "@/lib/auth";
import { getVernici } from "@/lib/verniciRepository";
import { getLaboratori } from "@/lib/laboratoriRepository";
import VerniciaturaSubNav from "@/components/VerniciaturaSubNav";
import TabellaVernici from "@/components/TabellaVernici";

export const dynamic = "force-dynamic";

export default async function VerniciaturaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!VERNICIATURA_ROLES.includes(session.role)) redirect("/");

  const [vernici, laboratori] = await Promise.all([
    getVernici({ soloAttivi: false }),
    getLaboratori(false),
  ]);

  return (
    <div className="space-y-4">
      <VerniciaturaSubNav />
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Verniciatura — Vernici</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Anagrafica vernici e ausiliari (catalizzatori, diluenti, induritori) — colore, fornitore/laboratorio, documentazione TS/SDS.
        </p>
      </div>
      <TabellaVernici vernici={vernici} laboratori={laboratori} />
    </div>
  );
}
