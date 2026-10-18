import { getSchedaByQrCodice } from "@/lib/schedaQrRepository";
import ScansioneScheda, { type SchedaScansionata } from "@/components/ScansioneScheda";

export const dynamic = "force-dynamic";

// Destinazione del QR stampato sulle schede (etichetta o timbro sul PDF): /q/<codice>. Serve il login
// del tablet (middleware); qui si risolve il codice e si mostra la scheda con le azioni disponibili.
export default async function ScansioneSchedaPage({ params }: { params: Promise<{ codice: string }> }) {
  const { codice } = await params;
  const scheda = await getSchedaByQrCodice(codice);

  let dati: SchedaScansionata | null = null;
  if (scheda) {
    dati = {
      id: scheda.id,
      odp: scheda.odp,
      tipologia: scheda.tipologia,
      numeroScheda: scheda.numeroScheda,
      commessaNr: scheda.commessaNr,
      clienteInfo: scheda.clienteInfo,
      codiceArticolo: scheda.codiceArticolo,
      posizione: scheda.posizione,
      quantita: scheda.quantita,
      statoProduzione: scheda.statoProduzione,
      fornitore: scheda.fornitore,
      pdfUrl: scheda.pdfAllegato[0]?.url ?? null,
    };
  }

  return <ScansioneScheda codice={codice.toUpperCase()} scheda={dati} />;
}
