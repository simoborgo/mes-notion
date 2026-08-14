import { getSchede } from "@/lib/schedeRepository";
import { getCommesse } from "@/lib/commesseRepository";
import { getSession } from "@/lib/auth";
import TabellaCommesse from "@/components/TabellaCommesse";
import CommesseSubNav from "@/components/CommesseSubNav";

export const dynamic = "force-dynamic";

export default async function CommessePage() {
  const [commesse, schede, session] = await Promise.all([getCommesse(), getSchede(), getSession()]);

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
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--color-primary)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
            </svg>
            Stampa Programma
          </a>
          <a
            href="/api/commesse/gantt"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--color-primary)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
            </svg>
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
      <TabellaCommesse commesse={commesse} schede={schede} userRole={session?.role} />
    </div>
  );
}
