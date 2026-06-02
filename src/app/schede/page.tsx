import { getSchede } from "@/lib/notion";
import TabellaSchede from "@/components/TabellaSchede";

export const dynamic = "force-dynamic";

export default async function SchedePage() {
  const schede = await getSchede();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Schede di Produzione
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          {schede.length} schede totali
        </p>
      </div>
      <TabellaSchede schede={schede} />
    </div>
  );
}
