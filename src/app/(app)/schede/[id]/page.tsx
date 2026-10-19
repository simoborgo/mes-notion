import { notFound } from "next/navigation";
import { getSchedaById, getSchedeFiglie } from "@/lib/schedeRepository";
import { getAttivitaScheda } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import SchedaPagina, { type TabScheda } from "@/components/SchedaPagina";

export const dynamic = "force-dynamic";

const TAB_VALIDE: TabScheda[] = ["info", "fornitore", "kit", "aps", "verniciatura"];

// Scheda di produzione a pagina piena (desktop). Il modale dell'elenco resta per la consultazione
// veloce; entrambi mostrano gli stessi componenti (DettaglioSchedaModal con modalita="pagina").
export default async function SchedaDettaglioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);

  let scheda, figlie, attivita;
  try {
    [scheda, figlie, attivita] = await Promise.all([getSchedaById(id), getSchedeFiglie(id), getAttivitaScheda(id)]);
  } catch {
    notFound();
  }
  const session = await getSession();
  const tabIniziale = TAB_VALIDE.find((t) => t === tab);

  return (
    <SchedaPagina
      key={scheda.id}
      scheda={scheda}
      figlie={figlie}
      attivita={attivita}
      userRole={session?.role}
      tabIniziale={tabIniziale}
    />
  );
}
