import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { REPARTI_ROLES } from "@/lib/roles";
import { getPatternCicloById, getFasiPattern } from "@/lib/patternCicloRepository";
import { getReparti } from "@/lib/repartiRepository";
import EditorPatternCiclo from "@/components/EditorPatternCiclo";

export const dynamic = "force-dynamic";

export default async function PatternCicloDettaglioPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!REPARTI_ROLES.includes(session.role)) redirect("/");

  const { id } = await params;
  const [pattern, fasi, reparti] = await Promise.all([
    getPatternCicloById(id),
    getFasiPattern(id),
    getReparti(),
  ]);
  if (!pattern) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/pattern-ciclo" className="text-sm font-medium" style={{ color: "var(--color-grey-mid)" }}>
          ← Pattern Ciclo
        </Link>
        <h1 className="text-2xl font-semibold mt-1" style={{ fontFamily: "var(--font-display)" }}>{pattern.nome}</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          {pattern.nArticoli} articoli assegnati — le modifiche non toccano le fasi già
          generate per ODP esistenti, solo le prossime generazioni.
        </p>
      </div>
      <EditorPatternCiclo pattern={pattern} fasiIniziali={fasi} reparti={reparti} />
    </div>
  );
}
