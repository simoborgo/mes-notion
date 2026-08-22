import { redirect } from "next/navigation";
import { getSession, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { getVernici } from "@/lib/verniciRepository";
import CercaVerniceForm from "@/components/CercaVerniceForm";

export const dynamic = "force-dynamic";

// Punto di ingresso alternativo alla scansione del QR (es. tablet tenuto sempre aperto in
// magazzino, o vernice non ancora etichettata) — non tocca in alcun modo la route di scan
// (/verniciatura/magazzino/vernici/[codiceInventario]): si limita a farci arrivare, con la
// stessa identica logica di carico/scarico/segnalazione/conteggio inventario a valle.
export default async function CercaVernicePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!MAGAZZINO_VERNICI_ROLES.includes(session.role)) redirect("/");

  const vernici = await getVernici({ soloAttivi: true });

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Cerca Vernice
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Senza QR sotto mano — cerca per Codice Modar o Codice Tintometro per registrare uno scarico, un carico o un utilizzo.
        </p>
      </div>
      <CercaVerniceForm vernici={vernici} />
    </div>
  );
}
