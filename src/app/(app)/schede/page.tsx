import { getSchede, getSottoschede, getCommesse } from "@/lib/notion";
import TabellaSchede from "@/components/TabellaSchede";
import { revalidateSchede } from "./actions";

export const dynamic = "force-dynamic";

export default async function SchedePage() {
  const [schede, sottoschede, commesse] = await Promise.all([getSchede(), getSottoschede(), getCommesse()]);

  return (
    <div className="space-y-5">
      <div className="no-print">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Schede di Produzione
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          {schede.length} schede · aggiornato {new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <TabellaSchede schede={schede} sottoschede={sottoschede} commesse={commesse} revalidate={revalidateSchede} />
    </div>
  );
}
