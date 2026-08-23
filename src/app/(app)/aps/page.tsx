import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { APS_GANTT_ROLES } from "@/lib/roles";
import { getDatiGantt } from "@/lib/apsGanttRepository";
import GanttAps from "@/components/GanttAps";

export const dynamic = "force-dynamic";

export default async function ApsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!APS_GANTT_ROLES.includes(session.role)) redirect("/");

  const dati = await getDatiGantt();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Pianificazione (APS)</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Piano di produzione per reparto — sola lettura, calcolato dal motore APS.
        </p>
      </div>
      <GanttAps dati={dati} />
    </div>
  );
}
