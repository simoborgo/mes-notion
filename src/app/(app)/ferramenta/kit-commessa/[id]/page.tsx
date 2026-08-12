import { notFound, redirect } from "next/navigation";
import { getSession, FERRAMENTA_ROLES, KIT_COMMESSA_CREA_ROLES } from "@/lib/auth";
import { getKitCommessaById, getRigheByKit } from "@/lib/kitCommessaRepository";
import { getArticoliFerramenta } from "@/lib/articoliFerramentaRepository";
import FerramentaSubNav from "@/components/FerramentaSubNav";
import KitCommessaDettaglio from "@/components/KitCommessaDettaglio";

export const dynamic = "force-dynamic";

export default async function KitCommessaDettaglioPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!KIT_COMMESSA_CREA_ROLES.includes(session.role)) redirect("/");
  const canManage = FERRAMENTA_ROLES.includes(session.role);

  const { id } = await params;
  const kit = await getKitCommessaById(id);
  if (!kit) notFound();

  const [righe, tuttiArticoli] = await Promise.all([
    getRigheByKit(id),
    getArticoliFerramenta(),
  ]);
  const articoli = tuttiArticoli.filter(a => a.attivo);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <FerramentaSubNav canManage={canManage} soloKitCommessa={!canManage} />
      <KitCommessaDettaglio
        kit={kit}
        righeIniziali={righe}
        articoli={articoli}
        puoSpuntare={canManage}
      />
    </div>
  );
}
