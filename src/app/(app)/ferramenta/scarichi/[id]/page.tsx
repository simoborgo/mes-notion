import { notFound, redirect } from "next/navigation";
import { getSession, FERRAMENTA_ROLES } from "@/lib/auth";
import { getScaricoConRighe } from "@/lib/scaricoRepository";
import FerramentaSubNav from "@/components/FerramentaSubNav";
import DettaglioScarico from "@/components/DettaglioScarico";

export const dynamic = "force-dynamic";

export default async function ScaricoDettaglioPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!FERRAMENTA_ROLES.includes(session.role)) redirect("/");

  const { id } = await params;
  const risultato = await getScaricoConRighe(id);
  if (!risultato) notFound();

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <FerramentaSubNav canManage={FERRAMENTA_ROLES.includes(session.role)} />
      <DettaglioScarico scarico={risultato.scarico} righeIniziali={risultato.righe} />
    </div>
  );
}
