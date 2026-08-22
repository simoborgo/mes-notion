import { notFound, redirect } from "next/navigation";
import { getSession, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { getVerniceByCodiceInventario } from "@/lib/verniciRepository";
import { getInventarioAperto, getRigaInventario } from "@/lib/inventarioMagazzinoRepository";
import VerniceCaricoScaricoCard from "@/components/VerniceCaricoScaricoCard";
import InventarioConteggioVerniceCard from "@/components/InventarioConteggioVerniceCard";
import AggiungiInventarioLiberoCard from "@/components/AggiungiInventarioLiberoCard";

export const dynamic = "force-dynamic";

// Target del QR stampato su entrambe le etichette Vernici (Scaffale e Vernice, vedi
// /api/verniciatura/vernici/[id]/etichetta-scaffale e .../etichetta-vernice) — il QR codifica il
// Codice Inventario (non l'id Postgres), scelta esplicita dell'utente per poter generare le
// etichette in batch dal software Zebra senza passare dall'app. Stesso branching di
// src/app/(app)/ferramenta/scarico/[id]/page.tsx: se c'è un inventario Vernici aperto che include
// questa vernice, mostra il conteggio invece di carico/scarico normale. Cutover netto: le vecchie
// etichette stampate con l'UUID nel QR non sono più valide, vanno ristampate.
export default async function ScanVernicePage({ params }: { params: Promise<{ codiceInventario: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!MAGAZZINO_VERNICI_ROLES.includes(session.role)) redirect("/");

  const { codiceInventario } = await params;

  let vernice;
  try {
    vernice = await getVerniceByCodiceInventario(codiceInventario);
  } catch {
    notFound();
  }
  if (!vernice.attivo) notFound();

  const sessione = await getInventarioAperto("vernici");
  const rigaInventario = sessione ? await getRigaInventario(sessione.id, vernice.id) : null;
  const daAggiungereALibero = !!sessione && sessione.ambito === "libero" && !rigaInventario;

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          {rigaInventario ? "Conteggio Inventario" : daAggiungereALibero ? "Inventario Libero" : "Magazzino Vernici"}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          {rigaInventario
            ? "Inserisci la quantità reale contata per questa vernice."
            : daAggiungereALibero
              ? "Conferma per aggiungerla alla lista in corso."
              : "Carico o scarico per questa vernice."}
        </p>
      </div>

      {rigaInventario && sessione ? (
        <InventarioConteggioVerniceCard vernice={vernice} riga={rigaInventario} sessioneId={sessione.id} />
      ) : daAggiungereALibero && sessione ? (
        <AggiungiInventarioLiberoCard vernice={vernice} sessioneId={sessione.id} />
      ) : (
        <VerniceCaricoScaricoCard vernice={vernice} />
      )}
    </div>
  );
}
