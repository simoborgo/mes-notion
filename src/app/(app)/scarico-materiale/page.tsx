import { getSchede } from "@/lib/schedeRepository";
import { getRitiri } from "@/lib/ritiriRepository";
import FormScaricoMateriale from "@/components/FormScaricoMateriale";
import { getSession, SCARICO_MATERIALE_ROLES } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const QUINDICI_GIORNI_MS = 15 * 24 * 60 * 60 * 1000;

export default async function ScaricoMaterialePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!SCARICO_MATERIALE_ROLES.includes(session.role)) redirect("/");

  const [schede, ritiri] = await Promise.all([getSchede(), getRitiri()]);

  const soglia = Date.now() - QUINDICI_GIORNI_MS;
  const suggerimenti = ritiri
    .filter(r => r.tipoMovimento === "Ritiro" && r.stato === "Fatto")
    .filter(r => {
      const data = r.dataFatto || r.dataTrasporto;
      return !!data && new Date(data).getTime() >= soglia;
    })
    .sort((a, b) => (b.dataFatto || b.dataTrasporto || "").localeCompare(a.dataFatto || a.dataTrasporto || ""))
    .slice(0, 15);

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Scarico Materiale
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Notifica alla produzione che c&apos;è materiale da scaricare
        </p>
      </div>
      <FormScaricoMateriale schede={schede} suggerimenti={suggerimenti} />
    </div>
  );
}
