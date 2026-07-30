import { NextRequest, NextResponse } from "next/server";
import { getCommesse, getCarichi } from "@/lib/notion";
import { getSessionFromRequest } from "@/lib/auth";
import { buildCommesseConCarichi } from "@/lib/reportCommesse";
import { buildProgrammaRiunioneWorkbook } from "@/lib/excel/programmaRiunione";

// Stessa logica della skill "modar-programma-riunione", ma applicata direttamente ai dati live
// del MES (join sull'ID reale della relation, non su una chiave testuale ricostruita da due CSV
// scollegati) — niente passaggio manuale per Claude, il file .xlsx è pronto al click.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const [commesse, carichi] = await Promise.all([getCommesse(), getCarichi()]);
    const righe = buildCommesseConCarichi(commesse, carichi);
    const buffer = await buildProgrammaRiunioneWorkbook(righe);

    const filename = `Programma_Commesse_MODAR_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[commesse/programma-riunione]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
