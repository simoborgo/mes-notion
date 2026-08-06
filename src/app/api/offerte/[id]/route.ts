import { NextRequest, NextResponse } from "next/server";
import { getOffertaConRighe, aggiornaCampiOfferta, eliminaOfferta } from "@/lib/offerteRepository";
import { getSessionFromRequest, OFFERTE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !OFFERTE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const risultato = await getOffertaConRighe(id);
    if (!risultato) return NextResponse.json({ error: "Offerta non trovata" }, { status: 404 });
    return NextResponse.json(risultato);
  } catch (e) {
    console.error("[offerte/[id] GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !OFFERTE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const offerta = await aggiornaCampiOfferta(id, {
      cliente: typeof body.cliente === "string" ? body.cliente.trim() : undefined,
      valoreCommessa: body.valoreCommessa !== undefined ? (body.valoreCommessa === "" || body.valoreCommessa === null ? null : Number(body.valoreCommessa)) : undefined,
      dataOfferta: typeof body.dataOfferta === "string" ? body.dataOfferta : undefined,
      dataConsegnaPrevista: body.dataConsegnaPrevista !== undefined ? (body.dataConsegnaPrevista || null) : undefined,
      probabilitaChiusura: body.probabilitaChiusura !== undefined ? Number(body.probabilitaChiusura) : undefined,
    });
    if (!offerta) return NextResponse.json({ error: "Offerta non trovata" }, { status: 404 });
    void logOperation(session.name, "UPDATE", "offerta", id, body);
    return NextResponse.json(offerta);
  } catch (e) {
    console.error("[offerte/[id] PATCH]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !OFFERTE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const eliminata = await eliminaOfferta(id);
    if (!eliminata) return NextResponse.json({ error: "Offerta non trovata" }, { status: 404 });
    void logOperation(session.name, "DELETE", "offerta", id, {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[offerte/[id] DELETE]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
