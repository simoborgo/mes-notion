import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, FERRAMENTA_ROLES } from "@/lib/auth";
import { getArticoliFerramenta } from "@/lib/articoliFerramentaRepository";
import { getFornitoriList } from "@/lib/fornitoriRepository";
import TabellaArticoliFerramenta from "@/components/TabellaArticoliFerramenta";
import FerramentaSubNav from "@/components/FerramentaSubNav";

export const dynamic = "force-dynamic";

export default async function AdminFerramentaPage() {
  const session = await getSession();
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    redirect("/");
  }

  const [articoli, fornitori] = await Promise.all([getArticoliFerramenta(), getFornitoriList()]);

  return (
    <div className="space-y-4">
      <FerramentaSubNav canManage={true} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Anagrafica Ferramenta
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
            Classifica gli articoli (Kanban / A Pezzo) e configura soglie e quantità vaschetta
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <a
            href="/api/ferramenta/export"
            className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors hover:opacity-90"
            style={{ borderColor: "var(--color-primary)", color: "var(--color-primary)" }}
          >
            Esporta CSV
          </a>
          <a
            href="/api/ferramenta/export/kanban"
            className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors hover:opacity-90"
            style={{ borderColor: "var(--color-primary)", color: "var(--color-primary)" }}
          >
            CSV Etichette Kanban
          </a>
          <a
            href="/api/ferramenta/export/etichette"
            className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors hover:opacity-90"
            style={{ borderColor: "var(--color-primary)", color: "var(--color-primary)" }}
          >
            CSV Etichette Identificative
          </a>
          <Link
            href="/admin/import-ferramenta"
            className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: "var(--color-primary)", color: "white" }}
          >
            + Importa da CSV
          </Link>
        </div>
      </div>
      <TabellaArticoliFerramenta articoli={articoli} fornitori={fornitori} />
    </div>
  );
}
