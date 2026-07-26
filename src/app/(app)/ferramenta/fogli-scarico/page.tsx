import { redirect } from "next/navigation";
import { getSession, FERRAMENTA_ROLES } from "@/lib/auth";
import { getSchedeOdpAvviate } from "@/lib/notion";
import { getOdpConMovimenti } from "@/lib/ferramentaRepository";
import FogliScaricoList from "@/components/FogliScaricoList";

export const dynamic = "force-dynamic";

export default async function FogliScaricoPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!FERRAMENTA_ROLES.includes(session.role)) redirect("/");

  const [schede, odpConMovimenti] = await Promise.all([getSchedeOdpAvviate(), getOdpConMovimenti()]);
  const odpConKit = schede
    .filter(s => s.kitFerramenta === "Si")
    .map(s => ({
      id: s.id,
      odp: s.odp,
      numeroScheda: s.numeroScheda,
      clienteInfo: s.clienteInfo,
      haMovimenti: odpConMovimenti.has(s.id),
    }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Fogli di Scarico
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Movimenti di ferramenta consuntivati per ODP — gli ODP con Kit confermato ma senza movimenti sono segnalati
        </p>
      </div>
      <FogliScaricoList odp={odpConKit} />
    </div>
  );
}
