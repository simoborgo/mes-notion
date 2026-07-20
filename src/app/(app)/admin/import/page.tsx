import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import ImportSchedaPdf from "@/components/ImportSchedaPdf";

export const dynamic = "force-dynamic";

export default async function ImportSchedaPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: "var(--color-black)" }}>
          Import Schede di Produzione
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Carica un PDF di scheda tecnica — i metadati vengono estratti con AI e importati in Notion con ODP auto-incrementato
        </p>
      </div>

      <div className="rounded-xl p-6" style={{ background: "white", border: "1px solid #e5e4e0" }}>
        <ImportSchedaPdf />
      </div>
    </div>
  );
}
