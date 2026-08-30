import { getSchede, getSottoschede } from "@/lib/schedeRepository";
import { getCommesse } from "@/lib/commesseRepository";
import { getSession } from "@/lib/auth";
import TabellaSchede from "@/components/TabellaSchede";
import SchedeSubNav from "@/components/SchedeSubNav";
import { revalidateSchede } from "./actions";

export const dynamic = "force-dynamic";

export default async function SchedePage() {
  const [schede, sottoschede, commesse, session] = await Promise.all([getSchede(), getSottoschede(), getCommesse(), getSession()]);

  return (
    <div className="space-y-5">
      <SchedeSubNav />
      <div className="no-print">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Schede di Produzione
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Aggiornato al {new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })} alle {new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <TabellaSchede schede={schede} sottoschede={sottoschede} commesse={commesse} revalidate={revalidateSchede} userRole={session?.role} />
    </div>
  );
}
