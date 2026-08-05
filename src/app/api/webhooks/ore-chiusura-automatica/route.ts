import { NextRequest, NextResponse } from "next/server";
import { getOperatori } from "@/lib/notion";
import { chiudiSegmentoCorrente, getMatricoleConSegmentoAperto } from "@/lib/segmentiOperatoreRepository";
import { logOperation } from "@/lib/audit";

// Orari nominali di fine turno, unica fonte usata per stimare l'orario di uscita di chi
// dimentica di chiudere — NON l'orario di "adesso" (quando passa il job schedulato). Con la
// chiusura automatica pensata come rete di sicurezza principale (l'operatore non deve più
// ricordarsi di premere "Ho finito"), assumere "adesso" gonfierebbe sistematicamente le ore
// di chiunque dimentichi, non solo nei rari casi di straordinario reale.
const FINE_TURNO_FERIALE = { ore: 18, minuti: 30 }; // lun-ven
const FINE_TURNO_SABATO = { ore: 12, minuti: 0 };   // sab (orario ridotto — talvolta 14:00, ma
                                                     // chi fa davvero straordinario preme "Ho finito" a mano)

function orarioChiusuraPresunta(now: Date): Date {
  const sabato = now.getDay() === 6;
  const { ore, minuti } = sabato ? FINE_TURNO_SABATO : FINE_TURNO_FERIALE;
  const target = new Date(now);
  target.setHours(ore, minuti, 0, 0);
  // Se il job schedulato passa prima dell'orario nominale (drift/anticipo), non si può assegnare
  // una chiusura nel futuro rispetto a "adesso" — in quel caso l'unica stima valida resta "adesso".
  return target.getTime() < now.getTime() ? target : now;
}

// Chiamata da uno Schedule Trigger n8n una volta al giorno, dopo l'orario nominale di fine
// turno più tardo (18:30 feriale) — un solo trigger giornaliero basta: la chiusura da assegnare
// non dipende da quando gira il job, ma dal giorno della settimana del segmento aperto.
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

    const chiusura = orarioChiusuraPresunta(new Date());
    const operatori = await getOperatori();
    const chiusi: string[] = [];
    const saltati: string[] = [];

    for (const matricola of matricole) {
      const op = operatori.find(o => o.matricola === matricola);
      if (!op) {
        saltati.push(matricola);
        continue;
      }
      await chiudiSegmentoCorrente({ matricola: op.matricola, cognome: op.cognome, nome: op.nome, azienda: op.azienda, reparto: op.reparto }, chiusura);
      void logOperation(`${op.cognome} ${op.nome}`, "UPDATE", "ore_registrate", matricola, { via: "cron-auto", azione: "chiusura-automatica", chiusoAlle: chiusura.toISOString() });
      chiusi.push(matricola);
    }

    return NextResponse.json({ ok: true, chiusi: chiusi.length, matricole: chiusi, saltati, chiusoAlle: chiusura.toISOString() });
  } catch (e) {
    console.error("[webhooks/ore-chiusura-automatica]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
