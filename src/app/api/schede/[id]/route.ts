import { NextRequest, NextResponse } from "next/server";
import { getSchedaById, updateScheda } from "@/lib/notion";
import type { SchedaUpdate } from "@/lib/types";
import { getSessionFromRequest } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const scheda = await getSchedaById(id);
    return NextResponse.json(scheda);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Scheda non trovata" }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSessionFromRequest(req);
    const body: SchedaUpdate = await req.json();
    const updated = await updateScheda(id, body);

    void logOperation(
      session?.name ?? "Sconosciuto",
      "UPDATE",
      "scheda",
      id,
      body as Record<string, unknown>
    );

    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore aggiornamento scheda" }, { status: 500 });
  }
}
