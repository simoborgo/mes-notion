import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import ImportFerramentaCsv from "@/components/ImportFerramentaCsv";

export const dynamic = "force-dynamic";

export default async function ImportFerramentaPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: "var(--color-black)" }}>
          Import Anagrafica Ferramenta
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Carica il CSV esportato da OS1 — import una tantum, verifica i match fornitore prima di confermare
        </p>
      </div>

      <div className="rounded-xl p-6" style={{ background: "white", border: "1px solid #e5e4e0" }}>
        <ImportFerramentaCsv />
      </div>
    </div>
  );
}
