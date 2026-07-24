import { NextRequest, NextResponse } from "next/server";
import { deleteRegistrazione, classificaCausale, type OreCausale } from "@/lib/oreRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

const CAUSALI: OreCausale[] = ["P", "T", "M", "C"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!CAUSALI.includes(body.causale)) {
    return NextResponse.json({ error: "Causale non valida (P/T/M/C)" }, { status: 400 });
  }
  try {
    const updated = await classificaCausale(id, body.causale);
    void logOperation(session.name, "UPDATE", "ore_registrate", id, { causale: body.causale });
    return NextResponse.json(updated);
  } catch (e) {
    console.error("[ore/registrazioni PATCH]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const ok = await deleteRegistrazione(id);
    if (!ok) return NextResponse.json({ error: "Non trovata" }, { status: 404 });
    void logOperation(session.name, "DELETE", "ore_registrate", id, {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[ore/registrazioni DELETE]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
