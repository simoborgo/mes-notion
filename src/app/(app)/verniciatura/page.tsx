import { redirect } from "next/navigation";
import { getSession, VERNICIATURA_ROLES } from "@/lib/auth";
import { getVernici } from "@/lib/verniciRepository";
import VerniciaturaSubNav from "@/components/VerniciaturaSubNav";
import TabellaVernici from "@/components/TabellaVernici";

export const dynamic = "force-dynamic";

export default async function VerniciaturaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!VERNICIATURA_ROLES.includes(session.role)) redirect("/");

  const vernici = await getVernici({ soloAttivi: false });

  return (
    <div className="space-y-4">
      <VerniciaturaSubNav />
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Verniciatura — Vernici</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Anagrafica vernici e ausiliari (catalizzatori, diluenti, induritori) — colore, fornitore, documentazione TS/SDS.
        </p>
      </div>
      <TabellaVernici vernici={vernici} />
    </div>
  );
}
