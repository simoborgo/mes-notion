import { getSession, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";
import { redirect } from "next/navigation";
import OreSubNav from "@/components/OreSubNav";
import VistaKpi from "@/components/VistaKpi";

export const dynamic = "force-dynamic";

export default async function KpiPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!RILEVAMENTO_ORE_ROLES.includes(session.role)) redirect("/");

  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      <h1 className="text-2xl font-semibold mb-1" style={{ fontFamily: "var(--font-display)" }}>
        Rilevamento Ore
      </h1>
      <p className="text-sm mb-5" style={{ color: "var(--color-grey-mid)" }}>
        Dashboard KPI
      </p>
      <OreSubNav active="kpi" />
      <VistaKpi />
    </div>
  );
}
