import { notFound, redirect } from "next/navigation";
import { getSession, FERRAMENTA_ROLES } from "@/lib/auth";
import { getSchedaById } from "@/lib/schedeRepository";
import { getDistintaKitByOdp } from "@/lib/kitFerramentaRepository";
import { getArticoliFerramenta } from "@/lib/articoliFerramentaRepository";
import GestioneKitOdp from "@/components/GestioneKitOdp";

export const dynamic = "force-dynamic";

export default async function KitOdpDettaglioPage({ params }: { params: Promise<{ schedaId: string }> }) {
  const session = await getSession();
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    redirect("/");
  }

  const { schedaId } = await params;
  let scheda;
  try {
    scheda = await getSchedaById(schedaId);
  } catch {
    notFound();
  }
  if (!scheda) notFound();

  const [righe, articoli] = await Promise.all([getDistintaKitByOdp(schedaId), getArticoliFerramenta()]);
  const articoliAPezzo = articoli.filter(a => a.attivo && a.metodoGestione === "A Pezzo");

  return (
    <div className="max-w-2xl mx-auto">
      <GestioneKitOdp scheda={scheda} righeIniziali={righe} articoliAPezzo={articoliAPezzo} />
    </div>
  );
}
