import { redirect } from "next/navigation";
import { getSession, RIENTRO_QUALITA_ROLES } from "@/lib/auth";
import { getSottoschede, getRitiri, getFornitoriList, getCommesse } from "@/lib/notion";
import RientroQualitaList from "@/components/RientroQualitaList";
import RitiriSubNav from "@/components/RitiriSubNav";

export const dynamic = "force-dynamic";

const STATI_CHIUSI = new Set(["Completato", "Annullata"]);

export default async function RientroQualitaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!RIENTRO_QUALITA_ROLES.includes(session.role)) redirect("/");

  const [sottoschede, ritiri, fornitori, commesse] = await Promise.all([
    getSottoschede(), getRitiri(), getFornitoriList(), getCommesse(),
  ]);
  const rilavorazioni = sottoschede.filter(
    s => s.tipologia === "Rilavorazione" && !STATI_CHIUSI.has(s.statoProduzione)
  );
  const ritiriRilavorazioni = ritiri.filter(r => !!r.rilavorazioneId);

  return (
    <div className="space-y-5">
      <RitiriSubNav userRole={session.role} />
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Rientro Qualità
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Rilavorazioni in attesa di rientro dal fornitore — {rilavorazioni.length} apert{rilavorazioni.length === 1 ? "a" : "e"}
        </p>
      </div>
      <RientroQualitaList rilavorazioni={rilavorazioni} ritiri={ritiriRilavorazioni} fornitori={fornitori} commesse={commesse} />
    </div>
  );
}
