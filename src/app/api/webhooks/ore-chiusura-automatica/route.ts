import { NextRequest, NextResponse } from "next/server";
import { getOperatori } from "@/lib/notion";
import { chiudiSegmentoCorrente, getMatricoleConSegmentoAperto } from "@/lib/segmentiOperatoreRepository";
import { logOperation } from "@/lib/audit";

// Chiamata da uno Schedule Trigger n8n una volta al giorno (20:00 — margine sufficiente
// per gli straordinari reali dei turni esistenti). Chiude ogni segmento ancora aperto:
// chiudiSegmentoCorrente calcola le ore esatte dai timestamp fino ad ora, quindi conteggia
// anche eventuali straordinari già maturati, non solo l'orario nominale di fine turno.
export async function POST(req: NextRequest) {
  const secret = process.env.ORE_CHIUSURA_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook non configurato" }, { status: 500 });
  }
  if (req.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const matricole = await getMatricoleConSegmentoAperto();
    if (matricole.length === 0) {
      return NextResponse.json({ ok: true, chiusi: 0, matricole: [], saltati: [] });
    }

    const operatori = await getOperatori();
    const chiusi: string[] = [];
    const saltati: string[] = [];

    for (const matricola of matricole) {
      const op = operatori.find(o => o.matricola === matricola);
      if (!op) {
        saltati.push(matricola);
        continue;
      }
      await chiudiSegmentoCorrente({ matricola: op.matricola, cognome: op.cognome, nome: op.nome, azienda: op.azienda, reparto: op.reparto });
      void logOperation(`${op.cognome} ${op.nome}`, "UPDATE", "ore_registrate", matricola, { via: "cron-auto", azione: "chiusura-automatica" });
      chiusi.push(matricola);
    }

    return NextResponse.json({ ok: true, chiusi: chiusi.length, matricole: chiusi, saltati });
  } catch (e) {
    console.error("[webhooks/ore-chiusura-automatica]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
