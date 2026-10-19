import { redirect } from "next/navigation";
import { getSession, KPI_PRODUZIONE_ROLES } from "@/lib/auth";
import { getKpiProduzione, dataLimiteKpi } from "@/lib/kpiProduzioneRepository";
import SchedeSubNav from "@/components/SchedeSubNav";
import DashboardKpiProduzione from "@/components/DashboardKpiProduzione";

export const dynamic = "force-dynamic";

const PERIODI_VALIDI = ["30", "90", "365", "tutto"] as const;
type PeriodoKpi = (typeof PERIODI_VALIDI)[number];

export default async function KpiProduzionePage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!KPI_PRODUZIONE_ROLES.includes(session.role)) redirect("/schede");

  const { periodo: periodoParam } = await searchParams;
  const periodo: PeriodoKpi = PERIODI_VALIDI.includes(periodoParam as PeriodoKpi) ? (periodoParam as PeriodoKpi) : "tutto";
  const dal = dataLimiteKpi(periodo === "tutto" ? null : Number(periodo));
  const kpi = await getKpiProduzione(dal);

  return (
    <div className="space-y-5">
      <SchedeSubNav mostraKpi />
      <div className="no-print">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>KPI Produzione</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Lead Time, costo, persone sugli ODP completati e tempi di rientro dai fornitori — periodo sulla data di produzione effettiva / di rientro
        </p>
      </div>
      <DashboardKpiProduzione odp={kpi.odp} esterne={kpi.esterne} aperti={kpi.aperti} oreReparto={kpi.oreReparto} costoOrario={kpi.costoOrario} periodo={periodo} dal={dal} />
    </div>
  );
}
