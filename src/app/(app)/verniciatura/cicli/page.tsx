import { redirect } from "next/navigation";
import { getSession, VERNICIATURA_ROLES } from "@/lib/auth";
import { getCicli } from "@/lib/cicliVerniciaturaRepository";
import VerniciaturaSubNav from "@/components/VerniciaturaSubNav";
import TabellaCicli from "@/components/TabellaCicli";

export const dynamic = "force-dynamic";

export default async function CicliPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!VERNICIATURA_ROLES.includes(session.role)) redirect("/");

  const cicli = await getCicli({ soloAttivi: false });

  return (
    <div className="space-y-4">
      <VerniciaturaSubNav />
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Cicli di verniciatura</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Schede: sequenza ordinata di fasi, ognuna con vernice/i principali e ausiliari con percentuale.
        </p>
      </div>
      <TabellaCicli cicli={cicli} />
    </div>
  );
}
