import { redirect } from "next/navigation";
import { getSession, FERRAMENTA_ROLES } from "@/lib/auth";
import { getArticoliFerramenta } from "@/lib/notion";
import CaricoFerramentaForm from "@/components/CaricoFerramentaForm";
import FerramentaSubNav from "@/components/FerramentaSubNav";

export const dynamic = "force-dynamic";

export default async function CaricoFerramentaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!FERRAMENTA_ROLES.includes(session.role)) redirect("/");

  const articoli = (await getArticoliFerramenta()).filter(a => a.attivo);

  return (
    <div className="space-y-4">
      <FerramentaSubNav isAdmin={session.role === "admin"} />
      <div className="max-w-md mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Carico Ferramenta
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
            Registra un rifornimento di magazzino.
          </p>
        </div>
        <CaricoFerramentaForm articoli={articoli} />
      </div>
    </div>
  );
}
