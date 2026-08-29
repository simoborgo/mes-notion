import { notFound, redirect } from "next/navigation";
import { getSession, VERNICIATURA_ROLES, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { getSchedaById } from "@/lib/schedeVerniciaturaRepository";
import VerniciaturaSubNav from "@/components/VerniciaturaSubNav";
import AperturaSchedaVerniciatura from "@/components/AperturaSchedaVerniciatura";

export const dynamic = "force-dynamic";

// Target del QR stampato sull'etichetta scheda (vedi /api/verniciatura/schede/[id]/etichetta) —
// apre direttamente la modale scheda, stessa esperienza completa di quando la apri dalla tabella
// (fasi/vernici, foto, stato, tutte le azioni), non una vista separata in sola lettura.
export default async function SchedaVerniciaturaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!VERNICIATURA_ROLES.includes(session.role)) redirect("/");

  const { id } = await params;
  try {
    await getSchedaById(id);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-4">
      <VerniciaturaSubNav canProduzione={VERNICIATURA_ROLES.includes(session.role)} canMagazzino={MAGAZZINO_VERNICI_ROLES.includes(session.role)} />
      <AperturaSchedaVerniciatura schedaId={id} />
    </div>
  );
}
