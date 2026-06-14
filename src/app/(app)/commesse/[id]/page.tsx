import { getCommessaById, getAreeByCommessa } from "@/lib/notion";
import BadgeStato from "@/components/BadgeStato";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

export default async function CommessaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let commessa, aree;
  try {
    [commessa, aree] = await Promise.all([getCommessaById(id), getAreeByCommessa(id)]);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/commesse" className="text-xs mb-2 inline-block" style={{ color: "var(--color-grey-mid)" }}>
            ← Tutte le commesse
          </Link>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {commessa.numeroCommessa} — {commessa.cliente}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
            {commessa.localita}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <BadgeStato stato={commessa.stato} />
          <a href={commessa.notionUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline" style={{ color: "var(--color-grey-mid)" }}>
            Apri in Notion ↗
          </a>
        </div>
      </div>

      {/* Info commessa */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 rounded-lg border border-gray-200 bg-white p-4">
        {[
          { label: "Responsabile", value: commessa.responsabile },
          { label: "Data Carico", value: fmt(commessa.dataCarico) },
          { label: "Inizio Montaggio", value: fmt(commessa.inizioMontaggio) },
          { label: "Fine Montaggio", value: fmt(commessa.fineMontaggio) },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs mb-0.5" style={{ color: "var(--color-grey-mid)" }}>{label}</p>
            <p className="text-sm font-medium">{value || "—"}</p>
          </div>
        ))}
      </div>

      {/* Aree */}
      <div>
        <h2 className="text-lg font-semibold mb-3" style={{ fontFamily: "var(--font-display)" }}>
          Aree / Cartelle ({aree.length})
        </h2>
        {aree.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessuna area collegata.</p>
        ) : (
          <div className="space-y-3">
            {aree.map((area) => (
              <div key={area.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{area.nomeArredo || "—"}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
                      {area.localitaCliente} {area.posizione ? `— ${area.posizione}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <BadgeStato stato={area.statoProduzione} />
                    <BadgeStato stato={area.statoCommessa} />
                  </div>
                </div>
                {area.completamento !== null && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs mb-1" style={{ color: "var(--color-grey-mid)" }}>
                      <span>Completamento</span>
                      <span>{area.completamento}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{ width: `${area.completamento}%`, background: "var(--color-primary)" }}
                      />
                    </div>
                  </div>
                )}
                {area.note && (
                  <p className="text-xs mt-2" style={{ color: "var(--color-grey-mid)" }}>{area.note}</p>
                )}
                <a
                  href={area.notionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs mt-2 inline-block underline"
                  style={{ color: "var(--color-grey-mid)" }}
                >
                  Apri in Notion ↗
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
