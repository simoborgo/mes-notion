import { redirect } from "next/navigation";
import { getSession, IMPOSTAZIONI_ROLES } from "@/lib/auth";
import { getOperatori } from "@/lib/notion";
import { getMatricoleConPin } from "@/lib/operatoriPinRepository";
import TabellaOperatoriPin from "@/components/TabellaOperatoriPin";
import ImpostazioniLayout from "@/components/ImpostazioniLayout";

export const dynamic = "force-dynamic";

export default async function AdminOperatoriPinPage() {
  const session = await getSession();
  if (!session || !IMPOSTAZIONI_ROLES.includes(session.role)) {
    redirect("/");
  }

  const [operatori, conPin] = await Promise.all([getOperatori(), getMatricoleConPin()]);
  const lista = operatori.map(o => ({ ...o, hasPin: conPin.has(o.matricola) }));

  return (
    <ImpostazioniLayout>
      <p className="text-sm mb-4" style={{ color: "var(--color-grey-mid)" }}>
        Il PIN identifica il singolo operatore sul tablet di reparto (sezione <code>/operatore</code>), separato dal login condiviso dell&apos;app.
      </p>
      <TabellaOperatoriPin operatoriIniziali={lista} />
    </ImpostazioniLayout>
  );
}
