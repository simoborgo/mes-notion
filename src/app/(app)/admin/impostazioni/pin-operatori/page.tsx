import { redirect } from "next/navigation";
import { getSession, IMPOSTAZIONI_ROLES } from "@/lib/auth";
import { getOperatori } from "@/lib/operatoriRepository";
import { getMatricoleConPin, getMatricoleConPinSolo } from "@/lib/operatoriPinRepository";
import TabellaOperatoriPin from "@/components/TabellaOperatoriPin";
import ImpostazioniLayout from "@/components/ImpostazioniLayout";

export const dynamic = "force-dynamic";

export default async function AdminOperatoriPinPage() {
  const session = await getSession();
  if (!session || !IMPOSTAZIONI_ROLES.includes(session.role)) {
    redirect("/");
  }

  const [operatori, conPin, conPinSolo] = await Promise.all([getOperatori(), getMatricoleConPin(), getMatricoleConPinSolo()]);
  const lista = operatori.map(o => ({ ...o, hasPin: conPin.has(o.matricola), pinSolo: conPinSolo.has(o.matricola) }));

  return (
    <ImpostazioniLayout>
      <p className="text-sm mb-4" style={{ color: "var(--color-grey-mid)" }}>
        Il PIN identifica il singolo operatore sul tablet di reparto (sezione <code>/operatore</code>), separato dal login condiviso dell&apos;app.
        Per entrare con il solo PIN (dopo la scansione del QR di una scheda) i PIN devono essere diversi tra operatori: chi è segnato
        «Serve nome + PIN» lo attiva al prossimo accesso con nome e PIN, oppure reimpostandogli il PIN.
      </p>
      <TabellaOperatoriPin operatoriIniziali={lista} />
    </ImpostazioniLayout>
  );
}
