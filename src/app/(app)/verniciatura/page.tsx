import { redirect } from "next/navigation";
import { getSession, VERNICIATURA_ROLES, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { getVernici } from "@/lib/verniciRepository";
import VerniciaturaSubNav from "@/components/VerniciaturaSubNav";
import TabellaVernici from "@/components/TabellaVernici";

export const dynamic = "force-dynamic";

export default async function VerniciaturaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const canProduzione = VERNICIATURA_ROLES.includes(session.role);
  const canMagazzino = MAGAZZINO_VERNICI_ROLES.includes(session.role);
  if (!canProduzione && !canMagazzino) redirect("/");
  // Chi ha solo il magazzino (non VERNICIATURA_ROLES) non ha accesso all'anagrafica: lo mandiamo
  // dritto alla tab che può usare, invece di mostrargli una pagina a cui l'API negherebbe l'accesso.
  if (!canProduzione) redirect("/verniciatura/magazzino");

  const vernici = await getVernici({ soloAttivi: false });

  return (
    <div className="space-y-4">
      <VerniciaturaSubNav canProduzione={canProduzione} canMagazzino={canMagazzino} />
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
