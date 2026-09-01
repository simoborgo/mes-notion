import { getCarichi } from "@/lib/carichiRepository";
import { getSchede } from "@/lib/schedeRepository";
import { getCommesse } from "@/lib/commesseRepository";
import { getSession, WRITE_ROLES } from "@/lib/auth";
import TabellaCarichi from "@/components/TabellaCarichi";
import CommesseSubNav from "@/components/CommesseSubNav";

export const dynamic = "force-dynamic";

export default async function CarichiPage() {
  const [carichi, commesse, schede, session] = await Promise.all([
    getCarichi(),
    getCommesse(),
    getSchede(),
    getSession(),
  ]);
  const canWrite = !!session && WRITE_ROLES.includes(session.role);

  return (
    <div className="space-y-5">
      <CommesseSubNav />
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Carichi
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          {carichi.length} carichi · aggiornato {new Date().toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <TabellaCarichi carichi={carichi} commesse={commesse} schede={schede} canWrite={canWrite} />
    </div>
  );
}
