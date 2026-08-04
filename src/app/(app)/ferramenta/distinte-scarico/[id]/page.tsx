import { notFound, redirect } from "next/navigation";
import { getSession, FERRAMENTA_ROLES } from "@/lib/auth";
import { getDistintaConRighe } from "@/lib/distinteScaricoRepository";
import FerramentaSubNav from "@/components/FerramentaSubNav";
import DettaglioDistintaScarico from "@/components/DettaglioDistintaScarico";

export const dynamic = "force-dynamic";

export default async function DistintaScaricoDettaglioPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!FERRAMENTA_ROLES.includes(session.role)) redirect("/");

  const { id } = await params;
  const risultato = await getDistintaConRighe(id);
  if (!risultato) notFound();

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <FerramentaSubNav canManage={FERRAMENTA_ROLES.includes(session.role)} />
      <DettaglioDistintaScarico distinta={risultato.distinta} righeIniziali={risultato.righe} />
    </div>
  );
}
