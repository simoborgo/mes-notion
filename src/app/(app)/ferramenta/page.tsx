import { redirect } from "next/navigation";
import { getSession, FERRAMENTA_ROLES, DISTINTE_SCARICO_CREA_ROLES } from "@/lib/auth";
import { getArticoliFerramenta } from "@/lib/articoliFerramentaRepository";
import FerramentaHome from "@/components/FerramentaHome";
import FerramentaSubNav from "@/components/FerramentaSubNav";

export const dynamic = "force-dynamic";

export default async function FerramentaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!DISTINTE_SCARICO_CREA_ROLES.includes(session.role)) redirect("/");
  // ufficio_tecnico non ha accesso a giacenze/anagrafica — l'unica sezione Ferramenta sua è
  // Distinte di Scarico, quindi lo mandiamo dritto lì invece di mostrargli questa pagina.
  if (!FERRAMENTA_ROLES.includes(session.role)) redirect("/ferramenta/distinte-scarico");

  const articoli = await getArticoliFerramenta();

  return (
    <div className="space-y-4">
      <FerramentaSubNav canManage={FERRAMENTA_ROLES.includes(session.role)} />
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Ferramenta
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Scorte magazzino ferramenta — segnala vaschette vuote o consumi
        </p>
      </div>
      <FerramentaHome articoli={articoli} />
    </div>
  );
}
