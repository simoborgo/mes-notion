import { getSchede, getSottoschede } from "@/lib/schedeRepository";
import { getRitiri } from "@/lib/ritiriRepository";
import { getCommesse } from "@/lib/commesseRepository";
import { getFornitoriList } from "@/lib/fornitoriRepository";
import { getSession } from "@/lib/auth";
import TabellaRitiri from "@/components/TabellaRitiri";
import RitiriSubNav from "@/components/RitiriSubNav";

export const dynamic = "force-dynamic";

export default async function RitiriPage({ searchParams }: { searchParams: Promise<{ cerca?: string; arch?: string; vista?: string }> }) {
  const { cerca, arch, vista } = await searchParams;
  const [ritiri, schede, sottoschede, fornitori, commesse, session] = await Promise.all([
    getRitiri(), getSchede(), getSottoschede(), getFornitoriList(), getCommesse(), getSession(),
  ]);
  // Costruisce mappa parentId → figli (include sottoschede e rilavorazioni)
  const childrenByParent = new Map<string, typeof sottoschede>();
  for (const s of sottoschede) {
    if (!s.parentId) continue;
    if (!childrenByParent.has(s.parentId)) childrenByParent.set(s.parentId, []);
    childrenByParent.get(s.parentId)!.push(s);
  }
  // Tutti i livelli: scheda → sottoschede → rilavorazioni
  const tutteLeSchede = schede.flatMap(s => {
    const ss = childrenByParent.get(s.id) ?? [];
    return [s, ...ss, ...ss.flatMap(sub => childrenByParent.get(sub.id) ?? [])];
  });

  return (
    <div className="space-y-5">
      <RitiriSubNav userRole={session?.role} />
      <TabellaRitiri ritiri={ritiri} schede={tutteLeSchede} fornitori={fornitori} commesse={commesse} userRole={session?.role} cercaIniziale={cerca ?? ""} apriArchivio={arch === "1"} vistaIniziale={vista === "split" || vista === "kanban" ? vista : "tabella"} />
    </div>
  );
}
