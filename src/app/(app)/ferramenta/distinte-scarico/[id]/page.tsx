import { notFound, redirect } from "next/navigation";
import { getSession, FERRAMENTA_ROLES, DISTINTE_SCARICO_CREA_ROLES } from "@/lib/auth";
import { getDistintaConRighe } from "@/lib/distinteScaricoRepository";
import { getArticoliFerramenta } from "@/lib/articoliFerramentaRepository";
import FerramentaSubNav from "@/components/FerramentaSubNav";
import DettaglioDistintaScarico from "@/components/DettaglioDistintaScarico";

export const dynamic = "force-dynamic";

export default async function DistintaScaricoDettaglioPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!DISTINTE_SCARICO_CREA_ROLES.includes(session.role)) redirect("/");
  const canManage = FERRAMENTA_ROLES.includes(session.role);

  const { id } = await params;
  const [risultato, tuttiArticoli] = await Promise.all([
    getDistintaConRighe(id),
    getArticoliFerramenta(),
  ]);
  if (!risultato) notFound();
  const articoli = tuttiArticoli.filter(a => a.attivo);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <FerramentaSubNav canManage={canManage} soloDistinteScarico={!canManage} />
      <DettaglioDistintaScarico distinta={risultato.distinta} righeIniziali={risultato.righe} puoChiudere={canManage} articoli={articoli} />
    </div>
  );
}
