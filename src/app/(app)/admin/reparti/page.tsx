import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { REPARTI_ROLES } from "@/lib/roles";
import { getReparti } from "@/lib/repartiRepository";
import TabellaReparti from "@/components/TabellaReparti";
import RicalcolaPianoApsButton from "@/components/RicalcolaPianoApsButton";

export const dynamic = "force-dynamic";

export default async function RepartiPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!REPARTI_ROLES.includes(session.role)) redirect("/");

  const reparti = await getReparti();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Reparti (APS)</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Anagrafica reparti per lo scheduling APS — capacità, tipo (corsie/monte ore), tamburo.
          I reparti segnati &quot;TBD&quot; hanno capacità placeholder, ancora da confermare.
        </p>
      </div>
      <TabellaReparti repartiIniziali={reparti} />
      <RicalcolaPianoApsButton />
    </div>
  );
}
