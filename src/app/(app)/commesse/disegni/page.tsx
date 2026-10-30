import { getCommesse } from "@/lib/commesseRepository";
import { getArrivoDisegni } from "@/lib/arrivoDisegniRepository";
import { dataOggiRoma } from "@/lib/oraLocale";
import CommesseSubNav from "@/components/CommesseSubNav";
import PanoramicaArrivoDisegni from "@/components/PanoramicaArrivoDisegni";

export const dynamic = "force-dynamic";

export default async function PanoramicaArrivoDisegniPage() {
  const commesse = (await getCommesse()).filter(c => c.stato === "ShopDrawing" || c.stato === "In produzione");
  const arrivi = await getArrivoDisegni(commesse.map(c => c.id));

  return (
    <div className="space-y-5">
      <CommesseSubNav />
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Arrivo disegni</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Commesse in ShopDrawing e in produzione: disegni arrivati per settimana (barre) e cumulato (linea). Clicca una commessa per il dettaglio.
        </p>
      </div>
      <PanoramicaArrivoDisegni
        commesse={commesse.map(c => ({
          id: c.id, numeroCommessa: c.numeroCommessa, cliente: c.cliente, localita: c.localita, stato: c.stato,
          inizioProduzione: c.inizioProduzione, fineProduzione: c.fineProduzione, dataCarico: c.dataCarico,
        }))}
        arrivi={Object.fromEntries(arrivi)}
        oggi={dataOggiRoma()}
      />
    </div>
  );
}
