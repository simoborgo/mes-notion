import { notFound } from "next/navigation";
import { getArticoloFerramentaById } from "@/lib/notion";
import ScaricoKanbanCard from "@/components/ScaricoKanbanCard";
import ScaricoAPezzoCard from "@/components/ScaricoAPezzoCard";

export const dynamic = "force-dynamic";

export default async function ScaricoFerramentaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let articolo;
  try {
    articolo = await getArticoloFerramentaById(id);
  } catch {
    notFound();
  }
  if (!articolo || !articolo.attivo) notFound();

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Scarico Ferramenta
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Segnala il consumo di questo articolo.
        </p>
      </div>

      {!articolo.metodoGestione ? (
        <div className="rounded-xl border-2 p-4" style={{ borderColor: "#FCD34D", background: "#FFFBEB" }}>
          <p className="font-semibold text-sm" style={{ color: "#92400E" }}>
            {articolo.descrizione}
          </p>
          <p className="text-sm mt-1" style={{ color: "#92400E" }}>
            Articolo non ancora classificato — contattare l&apos;amministratore.
          </p>
        </div>
      ) : articolo.metodoGestione === "Kanban" ? (
        <ScaricoKanbanCard articolo={articolo} />
      ) : (
        <ScaricoAPezzoCard articolo={articolo} />
      )}
    </div>
  );
}
