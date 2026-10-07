import { getSchede } from "@/lib/schedeRepository";
import { getCommesse } from "@/lib/commesseRepository";
import { getSchedaIdsInCarico, getOdpInPiuCarichi } from "@/lib/carichiRepository";
import { getSession } from "@/lib/auth";
import OdpSenzaCarico from "@/components/OdpSenzaCarico";
import CommesseSubNav from "@/components/CommesseSubNav";

export const dynamic = "force-dynamic";

export default async function OdpSenzaCaricoPage() {
  const [schede, commesse, schedeInCarico, inPiuCarichi, session] = await Promise.all([
    getSchede(),
    getCommesse(),
    getSchedaIdsInCarico(),
    getOdpInPiuCarichi(),
    getSession(),
  ]);

  return (
    <div className="space-y-5">
      <CommesseSubNav />
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          ODP senza carico
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          ODP attivi non assegnati a nessun carico: la loro data di produzione prevista non viene riallineata automaticamente
        </p>
      </div>
      <OdpSenzaCarico schede={schede} commesse={commesse} schedeInCarico={schedeInCarico} inPiuCarichi={inPiuCarichi} userRole={session?.role} />
    </div>
  );
}
