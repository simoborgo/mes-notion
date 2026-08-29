import { redirect } from "next/navigation";
import { getSession, FERRAMENTA_ROLES } from "@/lib/auth";
import { getSchedeOdpAvviate } from "@/lib/schedeRepository";
import { getStatoPreparazionePerOdp } from "@/lib/kitFerramentaRepository";
import FogliScaricoList from "@/components/FogliScaricoList";
import FerramentaSubNav from "@/components/FerramentaSubNav";

export const dynamic = "force-dynamic";

export default async function FogliScaricoPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!FERRAMENTA_ROLES.includes(session.role)) redirect("/");

  const schede = await getSchedeOdpAvviate();
  const schedeConKit = schede.filter(s => s.kitFerramenta === "Si");
  const statoPerOdp = await getStatoPreparazionePerOdp(schedeConKit.map(s => s.id));
  const odpConKit = schedeConKit.map(s => ({
    id: s.id,
    odp: s.odp,
    numeroScheda: s.numeroScheda,
    clienteInfo: s.clienteInfo,
    stato: statoPerOdp.get(s.id) ?? "mancante",
  }));

  return (
    <div className="space-y-4">
      <FerramentaSubNav canManage={FERRAMENTA_ROLES.includes(session.role)} />
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Richieste Ferramenta ODP
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Movimenti di ferramenta consuntivati per ODP — gli ODP con Kit Ferramenta confermato ma senza scarico sono segnalati
        </p>
      </div>
      <FogliScaricoList odp={odpConKit} />
    </div>
  );
}
