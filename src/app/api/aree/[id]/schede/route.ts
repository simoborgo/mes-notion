import { NextRequest, NextResponse } from "next/server";
import { getSchedeByArea } from "@/lib/notion";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const schede = await getSchedeByArea(id);
    return NextResponse.json(schede);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero schede per area" }, { status: 500 });
  }
}
