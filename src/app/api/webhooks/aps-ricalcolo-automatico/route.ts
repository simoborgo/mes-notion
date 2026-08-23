import { NextRequest, NextResponse } from "next/server";
import { ricalcolaPiano } from "@/lib/apsSchedulerRepository";
import { logOperation } from "@/lib/audit";

// Chiamata da uno Schedule Trigger n8n una volta al giorno — senza questo, il piano scatta solo
// su eventi espliciti (nuova Scheda, cambio priorità, fase completata/avviata, bottone manuale):
// una fase diventata disponibile che nessuno inizia resterebbe congelata alla data di quando fu
// calcolata l'ultima volta, finché non arriva un evento scollegato a rilanciare il ricalcolo. Il
// vincolo "mai prima di oggi" (nonPrimaDi, apsSchedulerRepository.ts) fa il resto: ogni fase
// rimasta ferma viene ripiazzata a partire da oggi al primo giro utile.
export async function POST(req: NextRequest) {
  const secret = process.env.APS_RICALCOLO_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook non configurato" }, { status: 500 });
  }
  if (req.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const risultato = await ricalcolaPiano();
    void logOperation("Sistema", "UPDATE", "reparto", "aps-ricalcolo", { azione: "ricalcola_piano_aps", via: "cron-auto", ...risultato });
    return NextResponse.json({ ok: true, ...risultato });
  } catch (e) {
    console.error("[webhooks/aps-ricalcolo-automatico]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
