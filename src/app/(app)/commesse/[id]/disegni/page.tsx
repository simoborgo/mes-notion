import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommessaById } from "@/lib/commesseRepository";
import { getArrivoDisegni } from "@/lib/arrivoDisegniRepository";
import { dataOggiRoma } from "@/lib/oraLocale";
import BadgeStato from "@/components/BadgeStato";
import CommesseSubNav from "@/components/CommesseSubNav";
import DashboardArrivoDisegni from "@/components/DashboardArrivoDisegni";

export const dynamic = "force-dynamic";

export default async function ArrivoDisegniCommessaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let commessa;
  try {
    commessa = await getCommessaById(id);
  } catch {
    notFound();
  }
  const arrivo = (await getArrivoDisegni([id])).get(id)!;

  return (
    <div className="space-y-5">
      <CommesseSubNav />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href={`/commesse/${id}`} className="text-xs underline" style={{ color: "var(--color-grey-mid)" }}>← Commessa {commessa.numeroCommessa}</Link>
          <h1 className="text-2xl font-semibold mt-1" style={{ fontFamily: "var(--font-display)" }}>
            Arrivo disegni — {commessa.numeroCommessa}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
            {[commessa.cliente, commessa.localita].filter(Boolean).join(" · ")}
          </p>
        </div>
        <BadgeStato stato={commessa.stato} />
      </div>
      <DashboardArrivoDisegni
        commessa={{
          id: commessa.id, numeroCommessa: commessa.numeroCommessa, cliente: commessa.cliente, localita: commessa.localita,
          stato: commessa.stato, inizioProduzione: commessa.inizioProduzione, fineProduzione: commessa.fineProduzione,
          dataCarico: commessa.dataCarico,
        }}
        arrivo={arrivo}
        oggi={dataOggiRoma()}
      />
    </div>
  );
}
