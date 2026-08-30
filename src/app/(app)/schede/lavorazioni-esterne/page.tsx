import { getSchede, getSottoschede } from "@/lib/schedeRepository";
import { getSession } from "@/lib/auth";
import TabellaLavorazioniEsterne from "@/components/TabellaLavorazioniEsterne";
import SchedeSubNav from "@/components/SchedeSubNav";
import { revalidateSchede } from "../actions";

export const dynamic = "force-dynamic";

export default async function LavorazioniEsternePage() {
  const [schede, sottoschede, session] = await Promise.all([getSchede(), getSottoschede(), getSession()]);

  return (
    <div className="space-y-5">
      <SchedeSubNav />
      <div className="no-print">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Sottoschede in Lavorazione Esterna
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Sottoschede in produzione esterna — monitoraggio date di consegna, indipendente dallo stato della scheda padre
        </p>
      </div>
      <TabellaLavorazioniEsterne sottoschede={sottoschede} schede={schede} userRole={session?.role} revalidate={revalidateSchede} />
    </div>
  );
}
