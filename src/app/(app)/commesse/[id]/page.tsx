import { getSchedeByCommessa } from "@/lib/schedeRepository";
import { getCommessaById, getRiepilogoCommessa } from "@/lib/commesseRepository";
import { getSchedeConFotoByCommessa } from "@/lib/schedeVerniciaturaRepository";
import { getAreeByCommessa } from "@/lib/areeRepository";
import { getSession, VERNICIATURA_ROLES, COMMESSA_CONTENUTO_ROLES } from "@/lib/auth";
import { getSpecificheByCommessa } from "@/lib/commessaSpecificheRepository";
import { getAllegatiByCommessa } from "@/lib/commessaAllegatiRepository";
import { getStoricoCommessa } from "@/lib/commessaStoricoRepository";
import CommessaStorico from "@/components/CommessaStorico";
import CommessaDocumenti from "@/components/CommessaDocumenti";
import CommessaSpecifiche from "@/components/CommessaSpecifiche";
import CommessaTabs from "@/components/CommessaTabs";
import CommessaCampionature from "@/components/CommessaCampionature";
import BadgeStato from "@/components/BadgeStato";
import AreeSection from "@/components/AreeSection";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
}

export default async function CommessaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  const tabAttiva = tab === "campionature" || tab === "specifiche" || tab === "documenti" || tab === "storico" ? tab : "panoramica";

  let commessa, aree, schede, riepilogo, campionature, specifiche, allegati, storico;
  try {
    [commessa, aree, schede, riepilogo, campionature, specifiche, allegati, storico] = await Promise.all([
      getCommessaById(id), getAreeByCommessa(id), getSchedeByCommessa(id), getRiepilogoCommessa(id), getSchedeConFotoByCommessa(id), getSpecificheByCommessa(id), getAllegatiByCommessa(id), getStoricoCommessa(id),
    ]);
  } catch {
    notFound();
  }
  const session = await getSession();

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

      <Link href={`/commesse/${commessa.id}/disegni`} className="text-sm font-semibold underline" style={{ color: "var(--color-primary)" }}>
        Arrivo disegni nel tempo →
      </Link>

      <CommessaTabs
        commessaId={commessa.id}
        attiva={tabAttiva}
        tabs={[{ key: "panoramica", label: "Panoramica" }, { key: "specifiche", label: "Specifiche", count: specifiche.length }, { key: "campionature", label: "Campionature", count: riepilogo.campionature }, { key: "documenti", label: "Documenti", count: allegati.length }, { key: "storico", label: "Storico" }]}
      />

      {tabAttiva === "specifiche" ? (
        <CommessaSpecifiche commessaId={commessa.id} specifiche={specifiche} allegati={allegati} canEdit={!!session && COMMESSA_CONTENUTO_ROLES.includes(session.role)} />
      ) : tabAttiva === "storico" ? (
        <CommessaStorico commessaId={commessa.id} eventi={storico} canEdit={!!session && COMMESSA_CONTENUTO_ROLES.includes(session.role)} />
      ) : tabAttiva === "documenti" ? (
        <CommessaDocumenti commessaId={commessa.id} allegati={allegati} specifiche={specifiche} canEdit={!!session && COMMESSA_CONTENUTO_ROLES.includes(session.role)} />
      ) : tabAttiva === "campionature" ? (
        <CommessaCampionature schede={campionature} canVerniciatura={!!session && VERNICIATURA_ROLES.includes(session.role)} />
      ) : (
        <>
          {/* Info commessa */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 rounded-lg border border-gray-200 bg-white p-4">
            {[
              { label: "Responsabile", value: commessa.responsabile },
              { label: "Inizio Produzione", value: fmt(commessa.inizioProduzione) },
              { label: "Fine Produzione", value: fmt(commessa.fineProduzione) },
              { label: "Prossimo Carico", value: fmt(commessa.dataCarico) },
              { label: "Inizio Montaggio", value: fmt(commessa.inizioMontaggio) },
              { label: "Fine Montaggio", value: fmt(commessa.fineMontaggio) },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs mb-0.5" style={{ color: "var(--color-grey-mid)" }}>{label}</p>
                <p className="text-sm font-medium">{value || "—"}</p>
              </div>
            ))}
          </div>

          {/* Riepilogo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { n: riepilogo.odp, label: `ODP (${riepilogo.odpCompletati} completati)` },
              { n: riepilogo.carichi, label: "Carichi" },
              { n: riepilogo.casse, label: `Casse (${riepilogo.casseCaricate} caricate)` },
              { n: riepilogo.campionature, label: "Campionature" },
            ].map(({ n, label }) => (
              <div key={label} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <p className="text-xl font-semibold tabular-nums">{n}</p>
                <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Aree */}
          <AreeSection commessaId={commessa.id} areeIniziali={aree} schede={schede} userRole={session?.role} />
        </>
      )}
    </div>
  );
}
