import { notFound } from "next/navigation";
import { getOdpAttivi } from "@/lib/notion";
import { getArticoloFerramentaById } from "@/lib/articoliFerramentaRepository";
import { getInventarioAperto, getRigaInventario } from "@/lib/inventarioFerramentaRepository";
import ScaricoGate from "@/components/ScaricoGate";
import InventarioConteggioCard from "@/components/InventarioConteggioCard";

export const dynamic = "force-dynamic";

export default async function ScaricoFerramentaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ odp?: string; ritorno?: string }> }) {
  const { id } = await params;
  const { odp: odpParam, ritorno } = await searchParams;
  // Solo path relativi interni — evita un open redirect se qualcuno costruisce il link a mano.
  const ritornoSicuro = ritorno && ritorno.startsWith("/") && !ritorno.startsWith("//") ? ritorno : null;

  let articolo;
  try {
    articolo = await getArticoloFerramentaById(id);
  } catch {
    notFound();
  }
  if (!articolo || !articolo.attivo) notFound();

  // Branching QR: se c'è un inventario aperto che include questo articolo,
  // mostra il conteggio invece dello scarico normale.
  const sessione = await getInventarioAperto();
  const rigaInventario = sessione ? await getRigaInventario(sessione.id, id) : null;

  const odpList = rigaInventario ? [] : await getOdpAttivi();
  const initialOdp = odpParam ? odpList.find(o => o.id === odpParam)?.odp ?? null : null;

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          {rigaInventario ? "Conteggio Inventario" : "Scarico Ferramenta"}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          {rigaInventario ? "Inserisci la quantità reale contata per questo articolo." : "Segnala il consumo di questo articolo."}
        </p>
      </div>

      {rigaInventario && sessione ? (
        <InventarioConteggioCard articolo={articolo} riga={rigaInventario} sessioneId={sessione.id} />
      ) : !articolo.metodoGestione ? (
        <div className="rounded-xl border-2 p-4" style={{ borderColor: "#FCD34D", background: "#FFFBEB" }}>
          <p className="font-semibold text-sm" style={{ color: "#92400E" }}>
            {articolo.descrizione}
          </p>
          <p className="text-sm mt-1" style={{ color: "#92400E" }}>
            Articolo non ancora classificato — contattare l&apos;amministratore.
          </p>
        </div>
      ) : (
        <ScaricoGate
          articolo={articolo}
          odpList={odpList}
          inventarioAperto={sessione ? { ambito: sessione.ambito, ambitoValore: sessione.ambitoValore } : null}
          initialOdp={initialOdp}
          ritorno={ritornoSicuro}
        />
      )}
    </div>
  );
}
