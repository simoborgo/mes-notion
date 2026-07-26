import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSchedaById, getDistintaKitByOdp, getArticoliFerramenta } from "@/lib/notion";
import GestioneKitOdp from "@/components/GestioneKitOdp";

export const dynamic = "force-dynamic";

export default async function KitOdpDettaglioPage({ params }: { params: Promise<{ schedaId: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
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
