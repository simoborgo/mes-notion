import { notFound, redirect } from "next/navigation";
import { getSession, RIENTRO_QUALITA_ROLES } from "@/lib/auth";
import { getSchedaById, getRitiriByScheda } from "@/lib/notion";
import RientroQualitaCard from "@/components/RientroQualitaCard";

export const dynamic = "force-dynamic";

export default async function RientroQualitaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!RIENTRO_QUALITA_ROLES.includes(session.role)) redirect("/");

  const { id } = await params;

  let scheda;
  try {
    scheda = await getSchedaById(id);
  } catch {
    notFound();
  }
  if (!scheda || scheda.tipologia !== "Rilavorazione") notFound();

  const giaCompletata = ["Completato", "Annullata"].includes(scheda.statoProduzione);
  const ritiriCollegati = giaCompletata ? [] : await getRitiriByScheda(scheda.id);

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Controllo Qualità — Rientro
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Verifica il pezzo rientrato e conferma per sbloccare la scheda.
        </p>
      </div>

      {giaCompletata ? (
        <div className="rounded-xl border-2 p-4" style={{ borderColor: "#e5e4e0", background: "#FAFAF9" }}>
          <p className="font-semibold text-sm" style={{ color: "var(--color-black)" }}>
            {scheda.odp} — {scheda.numeroScheda}
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
            Questa rilavorazione è già stata segnata come rientrata.
          </p>
        </div>
      ) : (
        <RientroQualitaCard scheda={scheda} ritiriCollegati={ritiriCollegati} />
      )}
    </div>
  );
}
