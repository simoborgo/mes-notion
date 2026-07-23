import { getRitiri, getSchede, getSottoschede, getFornitoriList, getCommesse } from "@/lib/notion";
import { getSession } from "@/lib/auth";
import TabellaRitiri from "@/components/TabellaRitiri";

export const dynamic = "force-dynamic";

export default async function RitiriPage() {
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
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Ritiri e Consegne
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          {ritiri.length} movimenti totali
        </p>
      </div>
      <TabellaRitiri ritiri={ritiri} schede={tutteLeSchede} fornitori={fornitori} commesse={commesse} userRole={session?.role} />
    </div>
  );
}
