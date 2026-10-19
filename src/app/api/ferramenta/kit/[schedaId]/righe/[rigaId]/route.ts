import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updateDistintaRigaQuantita, updateDistintaRigaDescrizione, deleteDistintaRiga } from "@/lib/kitFerramentaRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ schedaId: string; rigaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { schedaId, rigaId } = await params;
  let body: { quantita?: number; descrizione?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  const descrizione = body.descrizione?.trim();
  if (body.quantita === undefined && !descrizione) {
    return NextResponse.json({ error: "Nessuna modifica" }, { status: 400 });
  }
  if (body.quantita !== undefined && !(Number(body.quantita) > 0)) {
    return NextResponse.json({ error: "Quantità non valida" }, { status: 400 });
  }
  if (body.descrizione !== undefined && !descrizione) {
    return NextResponse.json({ error: "Descrizione non valida" }, { status: 400 });
  }

  try {
    if (body.quantita !== undefined) await updateDistintaRigaQuantita(rigaId, Number(body.quantita));
    if (descrizione) await updateDistintaRigaDescrizione(rigaId, descrizione);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore" }, { status: 400 });
  }
  void logOperation(session.name, "UPDATE", "kit_ferramenta", schedaId, { rigaId, quantita: body.quantita, descrizione });
  revalidatePath(`/admin/ferramenta/kit/${schedaId}`);
  revalidatePath(`/ferramenta/fogli-scarico/${schedaId}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ schedaId: string; rigaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { schedaId, rigaId } = await params;
  await deleteDistintaRiga(rigaId);
  void logOperation(session.name, "DELETE", "kit_ferramenta", schedaId, { rigaId });
  revalidatePath(`/admin/ferramenta/kit/${schedaId}`);
  revalidatePath(`/ferramenta/fogli-scarico/${schedaId}`);
  return NextResponse.json({ ok: true });
}
