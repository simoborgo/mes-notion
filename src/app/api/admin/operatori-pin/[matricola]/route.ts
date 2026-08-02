import { NextRequest, NextResponse } from "next/server";
import { impostaPin, rimuoviPin } from "@/lib/operatoriPinRepository";
import { getSessionFromRequest } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

const PIN_REGEX = /^\d{4}$/;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ matricola: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { matricola } = await params;
  const body = await req.json().catch(() => ({}));
  const { pin } = body;
  if (!PIN_REGEX.test(String(pin ?? ""))) {
    return NextResponse.json({ error: "Il PIN deve essere di 4 cifre numeriche" }, { status: 400 });
  }
  try {
    await impostaPin(matricola, String(pin));
    void logOperation(session.name, "UPDATE", "operatore_pin", matricola, { azione: "imposta-pin" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/operatori-pin PATCH]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ matricola: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { matricola } = await params;
  try {
    await rimuoviPin(matricola);
    void logOperation(session.name, "DELETE", "operatore_pin", matricola, { azione: "rimuovi-pin" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/operatori-pin DELETE]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
