import { notFound, redirect } from "next/navigation";
import { getSession, OFFERTE_ROLES } from "@/lib/auth";
import { getOffertaConRighe, getStimaRepartoOfferta } from "@/lib/offerteRepository";
import { getArticoli } from "@/lib/articoliRepository";
import { getCommesse } from "@/lib/notion";
import { getCostoOrarioManodopera } from "@/lib/parametriGeneraliRepository";
import DettaglioOfferta from "@/components/DettaglioOfferta";

export const dynamic = "force-dynamic";

export default async function OffertaDettaglioPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!OFFERTE_ROLES.includes(session.role)) redirect("/");

  const { id } = await params;
  const [risultato, articoli, commesse, costoOrarioManodopera, stimaReparto] = await Promise.all([
    getOffertaConRighe(id),
    getArticoli(),
    getCommesse(),
    getCostoOrarioManodopera(),
    getStimaRepartoOfferta(id),
  ]);
  if (!risultato) notFound();

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <DettaglioOfferta
        offerta={risultato.offerta}
        righeIniziali={risultato.righe}
        articoli={articoli}
        commesse={commesse.map(c => ({ id: c.id, numeroCommessa: c.numeroCommessa, cliente: c.cliente }))}
        costoOrarioManodopera={costoOrarioManodopera}
        stimaRepartoIniziale={stimaReparto}
      />
    </div>
  );
}
