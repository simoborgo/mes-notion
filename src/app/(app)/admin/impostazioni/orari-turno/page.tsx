import { redirect } from "next/navigation";
import { getSession, IMPOSTAZIONI_ROLES } from "@/lib/auth";
import { getOrariTurno } from "@/lib/parametriGeneraliRepository";
import OrariTurnoForm from "@/components/OrariTurnoForm";
import ImpostazioniLayout from "@/components/ImpostazioniLayout";

export const dynamic = "force-dynamic";

export default async function AdminOrariTurnoPage() {
  const session = await getSession();
  if (!session || !IMPOSTAZIONI_ROLES.includes(session.role)) {
    redirect("/");
  }

  const orari = await getOrariTurno();

  return (
    <ImpostazioniLayout>
      <p className="text-sm mb-4" style={{ color: "var(--color-grey-mid)" }}>
        Orari nominali di inizio/fine turno e pausa pranzo, usati come riferimento dal sistema (es. chiusura automatica del Rilevamento ore).
      </p>
      <OrariTurnoForm orariIniziali={orari} />
    </ImpostazioniLayout>
  );
}
