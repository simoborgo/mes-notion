import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { IMPOSTAZIONI_ROLES } from "@/lib/roles";
import { getBrand } from "@/lib/brandRepository";
import GestioneBrand from "@/components/GestioneBrand";

export const dynamic = "force-dynamic";

export default async function BrandPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!IMPOSTAZIONI_ROLES.includes(session.role)) redirect("/");

  const brand = await getBrand();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Brand</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Loghi dei brand per i documenti interni (per ora la stampa Carichi della commessa). Il brand si assegna
          dalla scheda commessa, con Modifica. Gli alias sono varianti del nome cliente separate da virgola,
          usate per suggerire il brand giusto.
        </p>
      </div>
      <GestioneBrand brandIniziali={brand} />
    </div>
  );
}
