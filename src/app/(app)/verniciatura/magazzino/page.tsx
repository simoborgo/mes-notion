import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, VERNICIATURA_ROLES, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { getVernici } from "@/lib/verniciRepository";
import VerniciaturaSubNav from "@/components/VerniciaturaSubNav";
import MagazzinoVerniciHome from "@/components/MagazzinoVerniciHome";

export const dynamic = "force-dynamic";

export default async function MagazzinoVerniciPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!MAGAZZINO_VERNICI_ROLES.includes(session.role)) redirect("/");

  const vernici = await getVernici({ soloAttivi: true });

  return (
    <div className="space-y-4">
      <VerniciaturaSubNav canProduzione={VERNICIATURA_ROLES.includes(session.role)} canMagazzino={true} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Magazzino Vernici</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
            Giacenze, carico e scarico — nessuna soglia di riordino, solo quantità.
          </p>
        </div>
        <Link
          href="/verniciatura/magazzino/inventario"
          className="shrink-0 text-sm px-4 py-2 rounded-lg font-semibold whitespace-nowrap border"
          style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", borderColor: "rgba(240,143,37,0.3)" }}
        >
          Inventario →
        </Link>
      </div>
      <MagazzinoVerniciHome vernici={vernici} />
    </div>
  );
}
