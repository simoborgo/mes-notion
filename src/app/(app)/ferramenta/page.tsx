import { redirect } from "next/navigation";
import { getSession, FERRAMENTA_ROLES } from "@/lib/auth";
import { getArticoliFerramenta } from "@/lib/notion";
import FerramentaHome from "@/components/FerramentaHome";
import FerramentaSubNav from "@/components/FerramentaSubNav";

export const dynamic = "force-dynamic";

export default async function FerramentaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!FERRAMENTA_ROLES.includes(session.role)) redirect("/");

  const articoli = await getArticoliFerramenta();

  return (
    <div className="space-y-4">
      <FerramentaSubNav isAdmin={session.role === "admin"} />
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
