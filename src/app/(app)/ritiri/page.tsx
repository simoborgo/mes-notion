import { getRitiri } from "@/lib/notion";
import TabellaRitiri from "@/components/TabellaRitiri";

export const dynamic = "force-dynamic";

export default async function RitiriPage() {
  const ritiri = await getRitiri();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Ritiri e Consegne
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          {ritiri.length} movimenti totali
        </p>
      </div>
      <TabellaRitiri ritiri={ritiri} />
    </div>
  );
}
