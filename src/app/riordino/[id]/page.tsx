import type { ArticoloFerramenta } from "@/lib/types";
import { getArticoloFerramentaById } from "@/lib/articoliFerramentaRepository";

export const dynamic = "force-dynamic";

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4 py-10" style={{ background: "var(--color-offwhite)" }}>
      <div className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: "#E4E0DA" }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 border-b last:border-0" style={{ borderColor: "#F0ECE5" }}>
      <span className="text-xs uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>{label}</span>
      <span className="text-sm font-semibold text-right" style={{ color: "var(--color-black)" }}>{value}</span>
    </div>
  );
}

export default async function RiordinoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let articolo: ArticoloFerramenta | null = null;
  try {
    articolo = await getArticoloFerramentaById(id);
  } catch {
    articolo = null;
  }

  if (!articolo) {
    return (
      <Card>
        <h1 className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-display)" }}>
          Articolo non trovato
        </h1>
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
          Questa scheda di riordino non è più disponibile. Contatta il magazzino per verificare il codice articolo.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--color-primary)" }}>
        Scheda di riordino
      </div>
      <h1 className="text-xl font-semibold mb-4" style={{ fontFamily: "var(--font-display)" }}>
        {articolo.descrizione || "—"}
      </h1>

      {(!articolo.attivo || articolo.metodoGestione !== "Kanban") && (
        <div className="mb-4 rounded-lg px-3 py-2 text-xs" style={{ background: "#FBF3E8", color: "var(--color-primary-dark)" }}>
          {!articolo.attivo
            ? "Articolo non attivo — verifica con il magazzino prima di procedere con il riordino."
            : "Questo articolo non è attualmente gestito a Kanban."}
        </div>
      )}

      <div>
        <Row label="Codice articolo" value={articolo.codiceOs1 || "—"} />
        <Row label="Fornitore" value={articolo.fornitoreNome || "—"} />
        <Row label="Codice fornitore" value={articolo.codiceFornitore || "—"} />
        <Row
          label="Quantità da riordinare"
          value={articolo.quantitaStandardVaschetta != null ? `${articolo.quantitaStandardVaschetta} ${articolo.unitaMisura || ""}`.trim() : "—"}
        />
        <Row label="Ubicazione" value={articolo.ubicazione || "—"} />
      </div>

      <p className="mt-5 text-[11px] leading-relaxed" style={{ color: "var(--color-grey-mid)" }}>
        Duplicato di emergenza dell&apos;etichetta fisica. Consegna questa scheda a chi effettua l&apos;ordine.
      </p>
    </Card>
  );
}
