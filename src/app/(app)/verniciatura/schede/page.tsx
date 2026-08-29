import { redirect } from "next/navigation";
import { getSession, VERNICIATURA_ROLES, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { getSchede } from "@/lib/schedeVerniciaturaRepository";
import VerniciaturaSubNav from "@/components/VerniciaturaSubNav";
import TabellaSchedeVerniciatura from "@/components/TabellaSchedeVerniciatura";

export const dynamic = "force-dynamic";

export default async function SchedeVerniciaturaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!VERNICIATURA_ROLES.includes(session.role)) redirect("/");

  // soloAttive di default (true): una scheda eliminata (attivo=false) non deve ricomparire al
  // prossimo caricamento della pagina — vedi disattivaLineage in schedeVerniciaturaRepository.ts.
  const schede = await getSchede();

  return (
    <div className="space-y-4">
      <VerniciaturaSubNav canProduzione={VERNICIATURA_ROLES.includes(session.role)} canMagazzino={MAGAZZINO_VERNICI_ROLES.includes(session.role)} />
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Schede di Verniciatura</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Ciclo (fasi + vernici con cod. inventario) + riferimento colore cliente + foto campione, con versioning delle prove fino alla validazione.
        </p>
      </div>
      <TabellaSchedeVerniciatura schede={schede} />
    </div>
  );
}
