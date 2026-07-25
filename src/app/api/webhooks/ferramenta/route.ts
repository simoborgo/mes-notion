import { NextRequest, NextResponse } from "next/server";
import { sendNotifica } from "@/lib/notify";

export async function POST(req: NextRequest) {
  const secret = process.env.FERRAMENTA_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook non configurato" }, { status: 500 });
  }
  if (req.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }

  const { articolo_id, event_id, giacenza_attuale, soglia_minima, codice_os1, descrizione } = body;
  if (typeof articolo_id !== "string" || typeof event_id !== "string") {
    return NextResponse.json({ error: "articolo_id / event_id mancanti" }, { status: 400 });
  }
  if (typeof giacenza_attuale !== "number" || typeof soglia_minima !== "number") {
    return NextResponse.json({ error: "giacenza_attuale / soglia_minima mancanti o non numerici" }, { status: 400 });
  }

  if (giacenza_attuale >= soglia_minima) {
    return NextResponse.json({ ok: true, notified: false });
  }

  const result = await sendNotifica({
    entityType: "articolo_ferramenta",
    entityId: articolo_id,
    eventType: "sotto_soglia_notion",
    eventId: event_id,
    webhookUrl: process.env.N8N_WEBHOOK_FERRAMENTA,
    payload: { articolo_id, codice_os1, descrizione, giacenza_attuale, soglia_minima },
  });

  return NextResponse.json({ ok: true, notified: result.sent, duplicate: result.duplicate, warning: result.warning });
}
