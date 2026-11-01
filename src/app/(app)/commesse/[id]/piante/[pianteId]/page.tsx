import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommessaById } from "@/lib/commesseRepository";
import { getPianteByCommessa, getAnnotazioniPianta, getZoneByPianta, getSchedeConZona } from "@/lib/commessePianteRepository";
import { getSchedeByCommessa } from "@/lib/schedeRepository";
import { getSession, PIANTE_ROLES } from "@/lib/auth";
import PiantaAnnotatore from "@/components/PiantaAnnotatore";

export const dynamic = "force-dynamic";

// Pagina dedicata alla pianta: stesso motore delle verifiche di spedizione (zoom, segni, bolli) più le zone cliccabili agganciate agli ODP.
export default async function PiantaPage({ params, searchParams }: { params: Promise<{ id: string; pianteId: string }>; searchParams: Promise<{ zona?: string; modifica?: string }> }) {
  const [{ id, pianteId }, { zona, modifica }] = await Promise.all([params, searchParams]);
  let commessa, piante;
  try {
    [commessa, piante] = await Promise.all([getCommessaById(id), getPianteByCommessa(id)]);
  } catch {
    notFound();
  }
  const pianta = piante.find((p) => p.id === pianteId);
  if (!pianta) notFound();
  const [annotazioni, zone, schede, schedeConZona, session] = await Promise.all([
    getAnnotazioniPianta(pianta.id), getZoneByPianta(pianta.id), getSchedeByCommessa(id), getSchedeConZona(id), getSession(),
  ]);
  const canEdit = !!session && PIANTE_ROLES.includes(session.role);

  return (
    <div className="space-y-3 max-w-[1800px] mx-auto">
      <nav className="flex items-center gap-2 text-[13.2px]" style={{ color: "var(--color-grey-mid)" }} aria-label="Percorso">
        <Link href={`/commesse/${commessa.id}`} className="hover:underline">← {commessa.numeroCommessa}</Link>
        <span>/</span>
        <span className="font-semibold" style={{ color: "var(--color-black)" }}>{pianta.etichetta || pianta.nomeFile}</span>
      </nav>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          {commessa.numeroCommessa} — {commessa.cliente}
        </h1>
        {piante.length > 1 && (
          <div className="flex gap-1.5 flex-wrap">
            {piante.map((p) => (
              <Link
                key={p.id}
                href={`/commesse/${commessa.id}/piante/${p.id}`}
                className="text-xs rounded-full border px-3 py-1"
                style={p.id === pianta.id ? { background: "var(--color-black)", color: "#fff", borderColor: "var(--color-black)" } : { background: "#fff", color: "var(--color-grey-mid)", borderColor: "#E4E0DA" }}
              >
                {p.etichetta || p.nomeFile}
              </Link>
            ))}
          </div>
        )}
      </div>
      <PiantaAnnotatore key={pianta.id} pianta={pianta} iniziali={annotazioni as never}
        zoneIniziali={zone}
        zonaIniziale={zone.find((z) => z.id === zona)?.id}
        odp={schede.map((x) => ({ id: x.id, odp: x.odp, numeroScheda: x.numeroScheda, statoProduzione: x.statoProduzione ?? "", faseCorrente: x.faseCorrente ?? "" }))}
        schedeConZona={schedeConZona}
        canEdit={canEdit}
        modificaIniziale={canEdit && modifica === "1"}
      />
    </div>
  );
}
