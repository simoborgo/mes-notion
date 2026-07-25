import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getArticoliFerramenta } from "@/lib/notion";
import TabellaArticoliFerramenta from "@/components/TabellaArticoliFerramenta";

export const dynamic = "force-dynamic";

export default async function AdminFerramentaPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    redirect("/");
  }

  const articoli = await getArticoliFerramenta();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Anagrafica Ferramenta
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Classifica gli articoli (Kanban / A Pezzo) e configura soglie e quantità vaschetta
        </p>
      </div>
      <TabellaArticoliFerramenta articoli={articoli} />
    </div>
  );
}
