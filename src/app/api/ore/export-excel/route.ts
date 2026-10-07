import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";
import { buildOreMensiliReport } from "@/lib/reportOreMensili";
import { buildOreMensiliWorkbook } from "@/lib/excel/oreMensili";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }
    const sp = new URL(req.url).searchParams;
    const da = sp.get("da") ?? "";
    const a = sp.get("a") ?? "";
    if (!DATA_RE.test(da) || !DATA_RE.test(a) || da > a) {
      return NextResponse.json({ error: "Periodo non valido" }, { status: 400 });
    }
    const righe = await buildOreMensiliReport(da, a);
    const buffer = await buildOreMensiliWorkbook(righe, da, a);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Ore_${da}_${a}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[ore/export-excel]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
