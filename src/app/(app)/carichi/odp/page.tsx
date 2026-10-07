import { getCarichi } from "@/lib/carichiRepository";
import { getSchede } from "@/lib/schedeRepository";
import { getCommesse } from "@/lib/commesseRepository";
import { getSession } from "@/lib/auth";
import OdpPerCarico from "@/components/OdpPerCarico";
import CommesseSubNav from "@/components/CommesseSubNav";

export const dynamic = "force-dynamic";

export default async function OdpPerCaricoPage() {
  const [carichi, commesse, schede, session] = await Promise.all([getCarichi(), getCommesse(), getSchede(), getSession()]);

  return (
    <div className="space-y-5">
      <CommesseSubNav />
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          ODP per carico
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Seleziona una commessa per vedere i suoi carichi e gli ODP previsti, in galleria con le copertine o in tabella
        </p>
      </div>
      <OdpPerCarico carichi={carichi} commesse={commesse} schede={schede} userRole={session?.role} />
    </div>
  );
}
