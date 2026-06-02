import { NextRequest, NextResponse } from "next/server";
import { updateRitiro } from "@/lib/notion";
import type { RitiroUpdate } from "@/lib/types";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body: RitiroUpdate = await req.json();
    const updated = await updateRitiro(id, body);
    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore aggiornamento ritiro" }, { status: 500 });
  }
}
