import { NextRequest, NextResponse } from "next/server";
import { getCommessaById, getAreeByCommessa } from "@/lib/notion";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [commessa, aree] = await Promise.all([
      getCommessaById(id),
      getAreeByCommessa(id),
    ]);
    return NextResponse.json({ commessa, aree });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Commessa non trovata" }, { status: 404 });
  }
}
