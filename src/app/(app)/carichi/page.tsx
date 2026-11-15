import { getCarichi, getOdpInPiuCarichi } from "@/lib/carichiRepository";
import { getSchede, getSottoschede } from "@/lib/schedeRepository";
import { getCommesse } from "@/lib/commesseRepository";
import { getSession, WRITE_ROLES } from "@/lib/auth";
import CarichiCommesse from "@/components/CarichiCommesse";
import CommesseSubNav from "@/components/CommesseSubNav";

export const dynamic = "force-dynamic";

// Pagina unica dei carichi: panoramica per commessa e, con ?commessa=<id>, l'area di lavoro dove
// gli ODP si assegnano ai carichi. Le vecchie /carichi/odp e /carichi/senza-carico rimandano qui.
export default async function CarichiPage({ searchParams }: { searchParams: Promise<{ cerca?: string; commessa?: string; daAssegnare?: string }> }) {
  const { cerca, commessa, daAssegnare } = await searchParams;
  const [carichi, commesse, schede, sottoschede, doppioni, session] = await Promise.all([
    getCarichi(),
    getCommesse(),
    getSchede(),
    getSottoschede(),
    getOdpInPiuCarichi(),
    getSession(),
  ]);
  const canWrite = !!session && WRITE_ROLES.includes(session.role);
  const commessaValida = commessa && commesse.some((c) => c.id === commessa) ? commessa : null;

  return (
    <div className="space-y-5">
      <CommesseSubNav />
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Carichi
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          {carichi.length} carichi · aggiornato {new Date().toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <CarichiCommesse
        carichi={carichi}
        commesse={commesse}
        schede={schede}
        sottoschede={sottoschede}
        doppioni={doppioni}
        canWrite={canWrite}
        commessaIniziale={commessaValida}
        cercaIniziale={cerca ?? ""}
        daAssegnareIniziale={daAssegnare === "1"}
      />
    </div>
  );
}
