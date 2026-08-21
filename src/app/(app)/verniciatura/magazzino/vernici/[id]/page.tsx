import { notFound, redirect } from "next/navigation";
import { getSession, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { getVerniceById } from "@/lib/verniciRepository";
import { getInventarioAperto, getRigaInventario } from "@/lib/inventarioMagazzinoRepository";
import VerniceCaricoScaricoCard from "@/components/VerniceCaricoScaricoCard";
import InventarioConteggioVerniceCard from "@/components/InventarioConteggioVerniceCard";

export const dynamic = "force-dynamic";

// Target del QR stampato su entrambe le etichette Vernici (Scaffale ed Vernice, vedi
// /api/verniciatura/vernici/[id]/etichetta-scaffale e .../etichetta-vernice) — stesso branching
// di src/app/(app)/ferramenta/scarico/[id]/page.tsx: se c'è un inventario Vernici aperto che
// include questa vernice, mostra il conteggio invece di carico/scarico normale.
export default async function ScanVernicePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!MAGAZZINO_VERNICI_ROLES.includes(session.role)) redirect("/");

  const { id } = await params;

  let vernice;
  try {
    vernice = await getVerniceById(id);
  } catch {
    notFound();
  }
  if (!vernice.attivo) notFound();

  const sessione = await getInventarioAperto("vernici");
  const rigaInventario = sessione ? await getRigaInventario(sessione.id, id) : null;

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          {rigaInventario ? "Conteggio Inventario" : "Magazzino Vernici"}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          {rigaInventario ? "Inserisci la quantità reale contata per questa vernice." : "Carico o scarico per questa vernice."}
        </p>
      </div>

      {rigaInventario && sessione ? (
        <InventarioConteggioVerniceCard vernice={vernice} riga={rigaInventario} sessioneId={sessione.id} />
      ) : (
        <VerniceCaricoScaricoCard vernice={vernice} />
      )}
    </div>
  );
}
