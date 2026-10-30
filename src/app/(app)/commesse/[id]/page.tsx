import { notFound } from "next/navigation";
import { getSchedeByCommessa } from "@/lib/schedeRepository";
import { getCommessaById, getRiepilogoCommessa } from "@/lib/commesseRepository";
import { getCarichiByCommessa } from "@/lib/carichiRepository";
import { getSchedeConFotoByCommessa } from "@/lib/schedeVerniciaturaRepository";
import { getAreeByCommessa } from "@/lib/areeRepository";
import { getSession, VERNICIATURA_ROLES, COMMESSA_CONTENUTO_ROLES } from "@/lib/auth";
import { getSpecificheByCommessa } from "@/lib/commessaSpecificheRepository";
import { getAllegatiByCommessa } from "@/lib/commessaAllegatiRepository";
import { getStoricoCommessa } from "@/lib/commessaStoricoRepository";
import CommessaIntestazione from "@/components/CommessaIntestazione";
import CommessaTabs from "@/components/CommessaTabs";
import CommessaPanoramica from "@/components/CommessaPanoramica";
import CommessaOdp from "@/components/CommessaOdp";
import CommessaSpecifiche from "@/components/CommessaSpecifiche";
import CommessaCampionature from "@/components/CommessaCampionature";
import CommessaDocumenti from "@/components/CommessaDocumenti";
import CommessaStorico from "@/components/CommessaStorico";
import AreeSection from "@/components/AreeSection";

export const dynamic = "force-dynamic";

const TAB_VALIDE = ["panoramica", "aree", "specifiche", "campionature", "documenti", "storico"] as const;
type TabCommessa = (typeof TAB_VALIDE)[number];

// Scheda commessa a pagina piena: unico dettaglio della commessa (l'elenco apre questa pagina dal
// numero). La tab aperta resta nell'indirizzo (?tab=).
export default async function CommessaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const tabAttiva: TabCommessa = TAB_VALIDE.find((t) => t === tab) ?? "panoramica";

  let commessa, aree, schede, carichi, riepilogo, campionature, specifiche, allegati, storico;
  try {
    [commessa, aree, schede, carichi, riepilogo, campionature, specifiche, allegati, storico] = await Promise.all([
      getCommessaById(id), getAreeByCommessa(id), getSchedeByCommessa(id), getCarichiByCommessa(id), getRiepilogoCommessa(id),
      getSchedeConFotoByCommessa(id), getSpecificheByCommessa(id), getAllegatiByCommessa(id), getStoricoCommessa(id),
    ]);
  } catch {
    notFound();
  }
  const session = await getSession();
  const canContenuto = !!session && COMMESSA_CONTENUTO_ROLES.includes(session.role);

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      <CommessaIntestazione commessa={commessa} userRole={session?.role} />

      <CommessaTabs
        commessaId={commessa.id}
        attiva={tabAttiva}
        tabs={[
          { key: "panoramica", label: "Panoramica" },
          { key: "aree", label: "Aree e ODP", count: schede.length },
          { key: "specifiche", label: "Specifiche", count: specifiche.length },
          { key: "campionature", label: "Campionature", count: riepilogo.campionature },
          { key: "documenti", label: "Documenti", count: allegati.length },
          { key: "storico", label: "Storico" },
        ]}
      />

      {tabAttiva === "panoramica" && <CommessaPanoramica commessa={commessa} schede={schede} carichi={carichi} riepilogo={riepilogo} />}
      {tabAttiva === "aree" && (
        <div className="space-y-6">
          <AreeSection commessaId={commessa.id} areeIniziali={aree} schede={schede} userRole={session?.role} />
          <CommessaOdp schede={schede} aree={aree} />
        </div>
      )}
      {tabAttiva === "specifiche" && <CommessaSpecifiche commessaId={commessa.id} specifiche={specifiche} allegati={allegati} canEdit={canContenuto} />}
      {tabAttiva === "campionature" && (
        <CommessaCampionature schede={campionature} canVerniciatura={!!session && VERNICIATURA_ROLES.includes(session.role)} />
      )}
      {tabAttiva === "documenti" && <CommessaDocumenti commessaId={commessa.id} allegati={allegati} specifiche={specifiche} canEdit={canContenuto} />}
      {tabAttiva === "storico" && <CommessaStorico commessaId={commessa.id} eventi={storico} canEdit={canContenuto} />}
    </div>
  );
}
