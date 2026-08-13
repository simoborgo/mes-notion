import { getSchedeByCommessa } from "@/lib/schedeRepository";
import { getCommessaById } from "@/lib/commesseRepository";
import { getAreeByCommessa } from "@/lib/areeRepository";
import BadgeStato from "@/components/BadgeStato";
import AreeSection from "@/components/AreeSection";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

export default async function CommessaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let commessa, aree, schede;
  try {
    [commessa, aree, schede] = await Promise.all([getCommessaById(id), getAreeByCommessa(id), getSchedeByCommessa(id)]);
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
      <AreeSection commessaId={commessa.id} areeIniziali={aree} schede={schede} />
    </div>
  );
}
