import { getSchede, getSottoschede, getFornitori } from "@/lib/notion";
import FormCaricoMagazzino from "@/components/FormCaricoMagazzino";
import { getSession, CARICO_ROLES } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CaricoMagazzinoPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!CARICO_ROLES.includes(session.role)) redirect("/");

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
