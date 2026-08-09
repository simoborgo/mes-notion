import { redirect } from "next/navigation";
import { getSession, VERNICIATURA_ROLES, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { getCampionature } from "@/lib/campionatureVerniciaturaRepository";
import VerniciaturaSubNav from "@/components/VerniciaturaSubNav";
import TabellaCampionature from "@/components/TabellaCampionature";

export const dynamic = "force-dynamic";

export default async function CampionaturePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!VERNICIATURA_ROLES.includes(session.role)) redirect("/");

  const campionature = await getCampionature({ soloAttive: false });

  return (
    <div className="space-y-4">
      <VerniciaturaSubNav canProduzione={VERNICIATURA_ROLES.includes(session.role)} canMagazzino={MAGAZZINO_VERNICI_ROLES.includes(session.role)} />
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Campionature</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Barcode cliente → scheda di verniciatura → vernici. L&apos;approvazione valida automaticamente il ciclo collegato.
        </p>
      </div>
      <TabellaCampionature campionature={campionature} />
    </div>
  );
}
