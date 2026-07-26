import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updateDistintaRigaQuantita, deleteDistintaRiga } from "@/lib/notion";
import { getSessionFromRequest } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ schedaId: string; rigaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { schedaId, rigaId } = await params;
  let body: { quantita?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  if (!(Number(body.quantita) > 0)) {
    return NextResponse.json({ error: "Quantità non valida" }, { status: 400 });
  }

  await updateDistintaRigaQuantita(rigaId, Number(body.quantita));
  void logOperation(session.name, "UPDATE", "kit_ferramenta", schedaId, { rigaId, quantita: body.quantita });
  revalidatePath(`/admin/ferramenta/kit/${schedaId}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ schedaId: string; rigaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { schedaId, rigaId } = await params;
  await deleteDistintaRiga(rigaId);
  void logOperation(session.name, "DELETE", "kit_ferramenta", schedaId, { rigaId });
  revalidatePath(`/admin/ferramenta/kit/${schedaId}`);
  return NextResponse.json({ ok: true });
}
