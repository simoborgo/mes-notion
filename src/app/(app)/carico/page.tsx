import { getSchede, getSottoschede, getFornitori } from "@/lib/notion";
import FormCaricoMagazzino from "@/components/FormCaricoMagazzino";

export const dynamic = "force-dynamic";

export default async function CaricoMagazzinoPage() {
  const [schede, sottoschede, fornitori] = await Promise.all([getSchede(), getSottoschede(), getFornitori()]);
  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Carico Magazzino
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Segnala materiale pronto per ritiro o spedizione
        </p>
      </div>
      <FormCaricoMagazzino schede={schede} sottoschede={sottoschede} fornitori={fornitori} />
    </div>
  );
}
