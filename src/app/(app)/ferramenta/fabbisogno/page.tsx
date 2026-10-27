import { redirect } from "next/navigation";
import { getSession, FERRAMENTA_ROLES } from "@/lib/auth";
import { getFabbisognoFerramenta } from "@/lib/kitFerramentaRepository";
import TabellaFabbisogno from "@/components/TabellaFabbisogno";
import FerramentaSubNav from "@/components/FerramentaSubNav";
import RichiesteTabs from "@/components/RichiesteTabs";

export const dynamic = "force-dynamic";

export default async function FabbisognoFerramentaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!FERRAMENTA_ROLES.includes(session.role)) redirect("/");

  const articoli = await getFabbisognoFerramenta();

  return (
    <div className="space-y-4">
      <FerramentaSubNav canManage={FERRAMENTA_ROLES.includes(session.role)} />
      <RichiesteTabs />
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Fabbisogno Ferramenta
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Tutto ciò che resta da preparare sugli ODP con kit confermato, sommato per articolo — per decidere cosa ordinare a blocco
        </p>
      </div>
      <TabellaFabbisogno articoli={articoli} />
    </div>
  );
}
