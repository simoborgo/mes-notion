import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { buildCarichiCommessaReport } from "@/lib/reportCarichiCommessa";
import { buildCarichiCommessaWorkbook } from "@/lib/excel/carichiCommessa";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { id } = await params;
    const report = await buildCarichiCommessaReport(id);
    const buffer = await buildCarichiCommessaWorkbook(report);

    const nome = report.commessa.numeroCommessa.replace(/[^\w.-]+/g, "_");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Carichi_${nome}_${new Date().toISOString().slice(0, 10)}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[commesse/carichi-excel]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
