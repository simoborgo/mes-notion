import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, MAGAZZINO_TRANCIATI_ROLES } from "@/lib/auth";
import { getTranciati } from "@/lib/tranciatiRepository";
import MagazzinoTranciatiHome from "@/components/MagazzinoTranciatiHome";

export const dynamic = "force-dynamic";

export default async function MagazzinoTranciatiPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!MAGAZZINO_TRANCIATI_ROLES.includes(session.role)) redirect("/");

  const tranciati = await getTranciati({ soloAttivi: false });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Magazzino Tranciati</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
            Anagrafica, giacenze, carico e scarico — nessuna soglia di riordino, solo quantità.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <Link
            href="/magazzino/tranciati/inventario"
            className="text-sm px-4 py-2 rounded-lg font-semibold whitespace-nowrap border"
            style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", borderColor: "rgba(240,143,37,0.3)" }}
          >
            Inventario →
          </Link>
        </div>
      </div>
      <MagazzinoTranciatiHome tranciati={tranciati} />
    </div>
  );
}
