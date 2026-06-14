import { NextRequest, NextResponse } from "next/server";
import { getCommessaById, getAreeByCommessa, getSchedeByCommessa } from "@/lib/notion";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [commessa, aree, schede] = await Promise.all([
      getCommessaById(id),
      getAreeByCommessa(id),
      getSchedeByCommessa(id),
    ]);
    return NextResponse.json({ commessa, aree, schede });
  } catch (e) {
    console.error("API commesse/[id] error:", e);
    return NextResponse.json({ error: "Non trovato", detail: String(e) }, { status: 404 });
  }
}
