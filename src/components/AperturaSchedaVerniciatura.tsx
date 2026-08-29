"use client";

import { useRouter } from "next/navigation";
import SchedaVerniciaturaModal from "./SchedaVerniciaturaModal";

// Apre subito la modale scheda (stessa usata dalla tabella) per l'id passato — usato dalla pagina
// raggiunta scansionando il QR dell'etichetta. Chiudendo si torna alla lista completa.
export default function AperturaSchedaVerniciatura({ schedaId }: { schedaId: string }) {
  const router = useRouter();
  const tornaAllaLista = () => router.push("/verniciatura/schede");

  return (
    <SchedaVerniciaturaModal
      schedaId={schedaId}
      onClose={tornaAllaLista}
      onSaved={() => {}}
      onDeleted={tornaAllaLista}
    />
  );
}
