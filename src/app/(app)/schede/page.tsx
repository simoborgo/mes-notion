import { getSchede, getSottoschede } from "@/lib/schedeRepository";
import { getCommesse } from "@/lib/commesseRepository";
import { getSchedaIdsInCarico, getDateCaricoPerScheda } from "@/lib/carichiRepository";
import { getSession, KPI_PRODUZIONE_ROLES } from "@/lib/auth";
import TabellaSchede from "@/components/TabellaSchede";
import SchedeSubNav from "@/components/SchedeSubNav";
import { revalidateSchede } from "./actions";

export const dynamic = "force-dynamic";

export default async function SchedePage() {
  const [schede, sottoschede, commesse, schedeInCarico, dateCarico, session] = await Promise.all([getSchede(), getSottoschede(), getCommesse(), getSchedaIdsInCarico(), getDateCaricoPerScheda(), getSession()]);

  return (
    <div className="space-y-5">
      <SchedeSubNav mostraKpi={!!session && KPI_PRODUZIONE_ROLES.includes(session.role)} />
      <div className="no-print">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Schede di Produzione
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Aggiornato al {new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" })} alle {new Date().toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <TabellaSchede schede={schede} sottoschede={sottoschede} commesse={commesse} schedeInCarico={schedeInCarico} dateCarico={dateCarico} revalidate={revalidateSchede} userRole={session?.role} />
    </div>
  );
}
