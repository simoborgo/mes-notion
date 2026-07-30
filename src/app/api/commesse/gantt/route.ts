import { NextRequest, NextResponse } from "next/server";
import { getCommesse, getCarichi } from "@/lib/notion";
import { getSessionFromRequest } from "@/lib/auth";
import { buildCommesseConCarichi } from "@/lib/reportCommesse";
import { buildGanttWorkbook } from "@/lib/excel/gantt";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const [commesse, carichi] = await Promise.all([getCommesse(), getCarichi()]);
    const righe = buildCommesseConCarichi(commesse, carichi);
    const buffer = await buildGanttWorkbook(righe);

    const filename = `Gantt_Commesse_Aperte_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[commesse/gantt]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
