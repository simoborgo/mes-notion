import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommessaById } from "@/lib/commesseRepository";
import { getPianteByCommessa, getAnnotazioniPianta } from "@/lib/commessePianteRepository";
import { getSession, COMMESSA_CONTENUTO_ROLES } from "@/lib/auth";
import PiantaAnnotatore from "@/components/PiantaAnnotatore";

export const dynamic = "force-dynamic";

// Pagina dedicata alla pianta: stesso motore delle verifiche di spedizione (zoom, segni, bolli).
export default async function PiantaPage({ params }: { params: Promise<{ id: string; pianteId: string }> }) {
  const { id, pianteId } = await params;
  let commessa, piante;
  try {
    [commessa, piante] = await Promise.all([getCommessaById(id), getPianteByCommessa(id)]);
  } catch {
    notFound();
  }
  const pianta = piante.find((p) => p.id === pianteId);
  if (!pianta) notFound();
  const [annotazioni, session] = await Promise.all([getAnnotazioniPianta(pianta.id), getSession()]);
  const canEdit = !!session && COMMESSA_CONTENUTO_ROLES.includes(session.role);

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
      <PiantaAnnotatore key={pianta.id} pianta={pianta} iniziali={annotazioni as never} canEdit={canEdit} />
    </div>
  );
}
