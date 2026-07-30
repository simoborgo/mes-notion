import { getCommesse, getSchede } from "@/lib/notion";
import TabellaCommesse from "@/components/TabellaCommesse";
import CommesseSubNav from "@/components/CommesseSubNav";

export const dynamic = "force-dynamic";

export default async function CommessePage() {
  const [commesse, schede] = await Promise.all([getCommesse(), getSchede()]);

  return (
    <div className="space-y-5">
      <CommesseSubNav />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Commesse
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
            {commesse.length} commesse totali
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <a
            href="/api/commesse/programma-riunione"
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--color-primary)" }}
          >
            Stampa Programma
          </a>
          <a
            href="/api/commesse/gantt"
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--color-primary)" }}
          >
            Stampa Gantt
          </a>
          <a
            href="/api/commesse/export"
            className="px-3 py-2 rounded-lg text-xs font-medium border transition-colors hover:opacity-90"
            style={{ borderColor: "#d1d5db", color: "var(--color-grey-mid)" }}
          >
            CSV Commesse
          </a>
          <a
            href="/api/carichi/export"
            className="px-3 py-2 rounded-lg text-xs font-medium border transition-colors hover:opacity-90"
            style={{ borderColor: "#d1d5db", color: "var(--color-grey-mid)" }}
          >
            CSV Carichi
          </a>
        </div>
      </div>
      <TabellaCommesse commesse={commesse} schede={schede} />
    </div>
  );
}
