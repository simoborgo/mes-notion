import { getSession, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";
import { redirect } from "next/navigation";
import OreSubNav from "@/components/OreSubNav";
import VistaOggi from "@/components/VistaOggi";
import { getOrariTurno, calcolaOreStandard } from "@/lib/parametriGeneraliRepository";

export const dynamic = "force-dynamic";

export default async function RilevamentoOrePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!RILEVAMENTO_ORE_ROLES.includes(session.role)) redirect("/");

  const orariTurno = await getOrariTurno();
  const { oreFeriale, oreSabato } = calcolaOreStandard(orariTurno);

  return (
    <div className="max-w-5xl mx-auto py-6 px-4">
      <h1 className="text-2xl font-semibold mb-1" style={{ fontFamily: "var(--font-display)" }}>
        Rilevamento Ore
      </h1>
      <p className="text-sm mb-5" style={{ color: "var(--color-grey-mid)" }}>
        Registrazione ore operatori a fine turno
      </p>
      <OreSubNav active="oggi" />
      <VistaOggi oreFeriale={oreFeriale} oreSabato={oreSabato} />
    </div>
  );
}
